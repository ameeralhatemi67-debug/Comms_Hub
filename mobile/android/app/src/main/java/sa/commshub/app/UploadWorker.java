package sa.commshub.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * One background upload (Uploads; MVP_draft.md 64.5): the held file sent to its Drive session in 8 MB pieces, the
 * protocol the browser's upload uses (src/lib/media/upload.ts). After a dropped connection it asks the session where it
 * stands (`Content-Range: bytes *&#47;size`) and goes on from there. It runs as a foreground task of the data-sync kind,
 * with «جارٍ رفع الملفات» in a quiet notice, so it goes on with the screen locked or the application closed; if Android
 * stops it, WorkManager starts it again and it resumes. No cookie of the site goes to Google: the application's own
 * connections carry none (Shell.narrow).
 */
public class UploadWorker extends Worker {

    static final int CHUNK = 8 * 1024 * 1024;
    static final String CHANNEL = "uploads";
    private static final Pattern RANGE = Pattern.compile("bytes=0-(\\d+)");
    private static final Pattern ID = Pattern.compile("\"id\"\\s*:\\s*\"([\\w-]{10,200})\"");
    private static final int MAX_RUNS = 10;

    public UploadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** What a session answered: its status, where it stands after a 308, and the file's id once complete. */
    static final class Answer {
        final int status;
        final long next;
        final String fileId;

        Answer(int status, long next, String fileId) {
            this.status = status;
            this.next = next;
            this.fileId = fileId;
        }
    }

    /** The offset after a 308's Range header ("bytes=0-N" means N+1 bytes are there; none means 0). Pure. */
    static long nextOffset(String rangeHeader) {
        if (rangeHeader == null) return 0;
        Matcher m = RANGE.matcher(rangeHeader.trim());
        return m.matches() ? Long.parseLong(m.group(1)) + 1 : 0;
    }

    /** The Drive file's id in a final answer. Pure. */
    static String fileIdOf(String body) {
        if (body == null) return null;
        Matcher m = ID.matcher(body);
        return m.find() ? m.group(1) : null;
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        String id = getInputData().getString("id");
        JSONObject o = id != null ? Uploads.get(c, id) : null;
        if (o == null) return Result.failure();
        Held.Item item = Held.get(c, o.optString("token"));
        File f = item != null ? Held.fileOf(c, item) : null;
        if (f == null || !f.isFile()) return fail(c, o, "FILE");
        String session = o.optString("session");
        if (!Uploads.allowedSession(session, Uploads.prefixes())) return fail(c, o, "SESSION");
        if (getRunAttemptCount() >= MAX_RUNS) return fail(c, o, "NETWORK");
        long size = f.length();
        setForegroundAsync(foreground(c, item.name, o.optLong("done"), size));
        put(c, o, "state", "sending");
        int errors = 0;
        long offset = 0;
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            if (o.optLong("done") > 0) {
                Answer a = probe(session, size);
                if (a.status == 200 || a.status == 201) return sent(c, o, a.fileId, size);
                if (a.status == 308) offset = a.next;
                else if (a.status == 404 || a.status == 410) return fail(c, o, "SESSION");
            }
            while (!isStopped()) {
                long end = Math.min(offset + CHUNK, size);
                Answer a;
                try {
                    a = send(session, raf, offset, end, size);
                } catch (IOException e) {
                    if (++errors > 6) return again(c, o);
                    sleep(1000L * errors);
                    try {
                        a = probe(session, size);
                    } catch (IOException e2) {
                        continue;
                    }
                }
                if (a.status == 308) {
                    offset = a.next;
                    errors = 0;
                    progress(c, o, item.name, offset, size);
                } else if (a.status == 200 || a.status == 201) {
                    return sent(c, o, a.fileId, size);
                } else if (a.status == 404 || a.status == 410) {
                    return fail(c, o, "SESSION");
                } else if (a.status >= 500 || a.status == 429) {
                    if (++errors > 6) return again(c, o);
                    sleep(1000L * errors);
                    try {
                        Answer p = probe(session, size);
                        if (p.status == 308) offset = p.next;
                    } catch (IOException ignored) {
                        // the next piece asks again
                    }
                } else {
                    return fail(c, o, "REFUSED");
                }
            }
            return again(c, o);
        } catch (IOException e) {
            return again(c, o);
        }
    }

    private static Answer send(String session, RandomAccessFile raf, long from, long to, long size) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(session).openConnection();
        try {
            conn.setRequestMethod("PUT");
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(120_000);
            conn.setDoOutput(true);
            long length = to - from;
            conn.setFixedLengthStreamingMode(length);
            conn.setRequestProperty("Content-Range", "bytes " + from + "-" + (to - 1) + "/" + size);
            byte[] buf = new byte[256 * 1024];
            raf.seek(from);
            try (OutputStream out = conn.getOutputStream()) {
                long left = length;
                while (left > 0) {
                    int n = raf.read(buf, 0, (int) Math.min(buf.length, left));
                    if (n < 0) throw new IOException("short");
                    out.write(buf, 0, n);
                    left -= n;
                }
            }
            return answer(conn);
        } finally {
            conn.disconnect();
        }
    }

    /** Where the session stands, as the browser's upload asks after a dropped connection. */
    private static Answer probe(String session, long size) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(session).openConnection();
        try {
            conn.setRequestMethod("PUT");
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(60_000);
            conn.setDoOutput(true);
            conn.setFixedLengthStreamingMode(0);
            conn.setRequestProperty("Content-Range", "bytes */" + size);
            conn.getOutputStream().close();
            return answer(conn);
        } finally {
            conn.disconnect();
        }
    }

    private static Answer answer(HttpURLConnection conn) throws IOException {
        int status = conn.getResponseCode();
        if (status == 308) return new Answer(308, nextOffset(conn.getHeaderField("Range")), null);
        String body = null;
        if (status == 200 || status == 201) {
            try (InputStream in = conn.getInputStream()) {
                body = read(in);
            }
        }
        return new Answer(status, 0, fileIdOf(body));
    }

    private static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        int n;
        while ((n = in.read(b)) != -1 && out.size() < 64 * 1024) out.write(b, 0, n);
        return out.toString("UTF-8");
    }

    private Result sent(Context c, JSONObject o, String fileId, long size) {
        if (fileId == null) return fail(c, o, "REFUSED");
        try {
            o.put("state", "sent").put("done", size).put("fileId", fileId).put("error", JSONObject.NULL);
        } catch (Exception ignored) {
            // plain values only
        }
        Uploads.save(c, o);
        return Result.success();
    }

    private Result fail(Context c, JSONObject o, String why) {
        try {
            o.put("state", "failed").put("error", why);
        } catch (Exception ignored) {
            // plain values only
        }
        Uploads.save(c, o);
        return Result.failure();
    }

    /** Android stopped the work or the network kept failing: queued again, it resumes where the session stands. */
    private Result again(Context c, JSONObject o) {
        put(c, o, "state", "queued");
        return Result.retry();
    }

    private static void put(Context c, JSONObject o, String key, String value) {
        try {
            o.put(key, value);
        } catch (Exception ignored) {
            // plain values only
        }
        Uploads.save(c, o);
    }

    private long shown = 0;

    private void progress(Context c, JSONObject o, String name, long done, long size) {
        try {
            o.put("done", done);
        } catch (Exception ignored) {
            // plain values only
        }
        Uploads.save(c, o);
        long now = System.currentTimeMillis();
        if (now - shown > 1000) {
            shown = now;
            setForegroundAsync(foreground(c, name, done, size));
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** The quiet notice «جارٍ رفع الملفات» with the file and its share sent. */
    private ForegroundInfo foreground(Context c, String name, long done, long size) {
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        if (manager != null && manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, c.getString(R.string.uploads_channel), NotificationManager.IMPORTANCE_LOW));
        }
        PendingIntent open = PendingIntent.getActivity(c, 7, new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE);
        int pct = size > 0 ? (int) Math.min(100, done * 100 / size) : 0;
        Notification n = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_notice)
            .setContentTitle(c.getString(R.string.uploads_title))
            .setContentText(c.getString(R.string.uploads_line, name, pct))
            .setProgress(100, pct, size <= 0)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(open)
            .build();
        return new ForegroundInfo(getId().hashCode(), n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
    }
}
