package sa.commshub.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.widget.Toast;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.SecureRandom;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The site's files on the phone (MVP_draft.md 64, «التنزيلات», and 64.2). A file of the site is fetched by the
 * application itself, with the web view's own cookies. The session never leaves this application's process: not
 * to the system's download service, whose database would keep the request's headers, and not to another
 * address, since a redirect away from the compiled list is followed without the cookie. No file's bytes cross
 * the bridge: the page names a file by its path and hears back only whether it worked.
 *
 * Four ways a file arrives:
 * - a link the web view cannot show (A2): saved to Downloads under the site's name;
 * - «حفظ في الهاتف» (A4): photos and videos to the gallery, everything else to Downloads;
 * - «فتح الملف» (A4): into this application's cache, then the phone's own viewer, through the FileProvider;
 * - «مشاركة» (A4): the same, then Android's share sheet; a file over SiteFiles.ASK_TO_SHARE asks first.
 * A file made inside the page (a blob or data address) cannot be fetched from outside the page, so the person
 * is told where to save it instead.
 */
final class Downloads {

    /** What the page hears back: true when the file was saved, opened, or handed to the share sheet. */
    interface Answer {
        void done(boolean ok);
    }

    private enum Kind { DOWNLOADS, SAVE, OPEN, SHARE }

    private static final int MAX_REDIRECTS = 5;
    private static final String CHANNEL = "downloads";
    private static final long SHARED_KEEP_MS = 24L * 60 * 60 * 1000;
    private static final AtomicInteger NOTICES = new AtomicInteger(4000);
    private static final SecureRandom RANDOM = new SecureRandom();
    private final Activity activity;
    private final String userAgent;
    private final ExecutorService pool = Executors.newFixedThreadPool(2);

    Downloads(Activity activity, String userAgent) {
        this.activity = activity;
        this.userAgent = userAgent;
        NotificationManager manager = activity.getSystemService(NotificationManager.class);
        if (manager != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, activity.getString(R.string.downloads_channel), NotificationManager.IMPORTANCE_LOW);
            channel.setDescription(activity.getString(R.string.downloads_channel_about));
            manager.createNotificationChannel(channel);
        }
        pool.execute(this::sweepShared);
    }

    /** A link of the page the web view cannot show (A2): Downloads. */
    void start(String url, String linkUserAgent, String disposition, String mime) {
        if (url == null) return;
        String lower = url.toLowerCase();
        if (lower.startsWith("blob:") || lower.startsWith("data:")) {
            say(R.string.download_in_page);
            return;
        }
        if (!Navigation.isAllowed(url, Shell.ALLOWED)) {
            // A file of another site: the browser downloads it, as any link to another site opens there.
            MainActivity.openOutside(activity, url);
            return;
        }
        say(R.string.download_started);
        pool.execute(() -> run(Kind.DOWNLOADS, url, linkUserAgent, disposition, mime, null, false, null));
    }

    /** «حفظ في الهاتف»: `address` is already a file route on the page's own origin (SiteFiles.address). */
    void save(String address, String name, Answer answer) {
        say(R.string.save_started);
        pool.execute(() -> run(Kind.SAVE, address, userAgent, null, null, name, false, answer));
    }

    /** «فتح الملف»: the phone's own viewer, since the web view has none for documents. */
    void open(String address, String name, Answer answer) {
        say(R.string.open_started);
        pool.execute(() -> run(Kind.OPEN, address, userAgent, null, null, name, false, answer));
    }

    /** «مشاركة»: Android's share sheet. */
    void share(String address, String name, Answer answer) {
        say(R.string.share_started);
        pool.execute(() -> run(Kind.SHARE, address, userAgent, null, null, name, false, answer));
    }

    /** The connection to a file, after its redirects, and the address it finally came from. */
    private static final class Fetched {
        final HttpURLConnection conn;
        final String at;

        Fetched(HttpURLConnection conn, String at) {
            this.conn = conn;
            this.at = at;
        }
    }

    private static Fetched connect(String address, String agent) throws Exception {
        String at = address;
        for (int hop = 0; ; hop++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(at).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(60_000);
            if (agent != null) conn.setRequestProperty("User-Agent", agent);
            // The site's cookie goes only to an address on the compiled list.
            if (Navigation.isAllowed(at, Shell.ALLOWED)) {
                String cookie = CookieManager.getInstance().getCookie(at);
                if (cookie != null) conn.setRequestProperty("Cookie", cookie);
            }
            int code = conn.getResponseCode();
            String location = conn.getHeaderField("Location");
            if (code >= 300 && code < 400 && location != null && hop < MAX_REDIRECTS) {
                String next = URI.create(at).resolve(location).toString();
                conn.disconnect();
                String scheme = next.toLowerCase();
                if (!scheme.startsWith("https://") && !scheme.startsWith("http://")) throw new IllegalStateException("scheme");
                at = next;
                continue;
            }
            if (code != 200) {
                conn.disconnect();
                throw new IllegalStateException("status " + code);
            }
            return new Fetched(conn, at);
        }
    }

    private void run(Kind kind, String address, String agent, String disposition, String mime, String pageName, boolean confirmed, Answer answer) {
        Fetched got = null;
        Uri row = null;
        File file = null;
        int notice = 0;
        ContentResolver resolver = activity.getContentResolver();
        try {
            got = connect(address, agent);
            HttpURLConnection conn = got.conn;
            String header = conn.getContentType() != null ? conn.getContentType().split(";")[0].trim() : null;
            String type = header != null && !header.isEmpty() ? header : mime;
            String name = FileNames.fromDisposition(conn.getHeaderField("Content-Disposition"));
            if (name == null) name = FileNames.fromDisposition(disposition);
            if (name == null) name = pageName;
            if (name == null) name = FileNames.fromUrl(got.at);
            if (name == null) {
                String ext = type == null ? null : MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
                name = activity.getString(R.string.download_fallback_name) + (ext != null ? "." + ext : "");
            }
            if (type == null || type.isEmpty() || "application/octet-stream".equals(type)) type = typeOfName(name, type);
            long total = conn.getContentLengthLong();
            if (kind == Kind.SHARE && !confirmed && total > SiteFiles.ASK_TO_SHARE) {
                conn.disconnect();
                got = null;
                askToShare(address, pageName, total, answer);
                return;
            }
            notice = progressStart(name);
            if (kind == Kind.DOWNLOADS || kind == Kind.SAVE) {
                SiteFiles.Place place = kind == Kind.SAVE ? SiteFiles.placeOf(type) : SiteFiles.Place.DOWNLOADS;
                Object[] made = insert(resolver, place, name, type);
                row = (Uri) made[0];
                place = (SiteFiles.Place) made[1];
                try (InputStream in = conn.getInputStream(); OutputStream out = resolver.openOutputStream(row)) {
                    if (out == null) throw new IllegalStateException("no stream");
                    copy(in, out, total, notice, name);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(row, done, null, null);
                final String saved = name;
                final int text = place == SiteFiles.Place.DOWNLOADS ? R.string.download_done : R.string.save_done_gallery;
                activity.runOnUiThread(() -> Toast.makeText(activity, activity.getString(text, saved), Toast.LENGTH_LONG).show());
                if (answer != null) answer.done(true);
            } else {
                file = sharedFile(name);
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(file)) {
                    copy(in, out, total, notice, name);
                }
                final Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
                final String shown = type;
                final String label = name;
                activity.runOnUiThread(() -> {
                    boolean ok = kind == Kind.OPEN ? view(uri, shown) : send(uri, shown, label);
                    if (answer != null) answer.done(ok);
                });
            }
        } catch (Exception e) {
            if (row != null) {
                try {
                    resolver.delete(row, null, null);
                } catch (Exception ignored) {
                    // nothing more to undo
                }
            }
            if (file != null) delete(file.getParentFile());
            say(kind == Kind.OPEN ? R.string.open_failed : kind == Kind.SHARE ? R.string.share_failed : R.string.download_failed);
            if (answer != null) answer.done(false);
        } finally {
            if (got != null) got.conn.disconnect();
            progressEnd(notice);
        }
    }

    /** A row of the gallery or of Downloads; the gallery refuses some kinds of picture, which then go to Downloads. */
    private Object[] insert(ContentResolver resolver, SiteFiles.Place place, String name, String type) {
        String album = activity.getString(R.string.app_name);
        if (place == SiteFiles.Place.IMAGES || place == SiteFiles.Place.VIDEOS) {
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, type);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, (place == SiteFiles.Place.IMAGES ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_MOVIES) + "/" + album);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri collection = place == SiteFiles.Place.IMAGES ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                Uri row = resolver.insert(collection, values);
                if (row != null) return new Object[] { row, place };
            } catch (Exception ignored) {
                // a kind the gallery does not take: Downloads below
            }
        }
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        if (type != null) values.put(MediaStore.Downloads.MIME_TYPE, type);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri row = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (row == null) throw new IllegalStateException("no row");
        return new Object[] { row, SiteFiles.Place.DOWNLOADS };
    }

    private static String typeOfName(String name, String fallback) {
        int dot = name.lastIndexOf('.');
        String guess = dot > 0 ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase()) : null;
        return guess != null ? guess : (fallback != null ? fallback : "application/octet-stream");
    }

    private void copy(InputStream in, OutputStream out, long total, int notice, String name) throws Exception {
        byte[] buffer = new byte[64 * 1024];
        long done = 0;
        long shown = 0;
        int n;
        while ((n = in.read(buffer)) != -1) {
            out.write(buffer, 0, n);
            done += n;
            long now = System.currentTimeMillis();
            if (now - shown > 700) {
                shown = now;
                progress(notice, name, done, total);
            }
        }
        if (total > 0 && done != total) throw new IllegalStateException("short");
    }

    // --- the cache folder shared with the viewer and the share sheet -----------------------------------------

    /** A new file under cache/shared/<random>/, the only folder the FileProvider names (res/xml/file_paths.xml). */
    private File sharedFile(String name) {
        byte[] b = new byte[8];
        RANDOM.nextBytes(b);
        StringBuilder hex = new StringBuilder();
        for (byte x : b) hex.append(String.format("%02x", x));
        File dir = new File(new File(activity.getCacheDir(), "shared"), hex.toString());
        if (!dir.mkdirs() && !dir.isDirectory()) throw new IllegalStateException("no folder");
        return new File(dir, name);
    }

    /** Files handed to a viewer or the share sheet are kept a day, as the other application may read them late. */
    private void sweepShared() {
        File[] dirs = new File(activity.getCacheDir(), "shared").listFiles();
        if (dirs == null) return;
        long now = System.currentTimeMillis();
        for (File d : dirs) if (now - d.lastModified() > SHARED_KEEP_MS) delete(d);
    }

    private static void delete(File f) {
        if (f == null) return;
        File[] inside = f.listFiles();
        if (inside != null) for (File x : inside) delete(x);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private boolean view(Uri uri, String type) {
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            Toast.makeText(activity, R.string.open_no_viewer, Toast.LENGTH_LONG).show();
            return false;
        }
    }

    private boolean send(Uri uri, String type, String name) {
        Intent send = new Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        send.setClipData(ClipData.newRawUri(name, uri));
        try {
            activity.startActivity(Intent.createChooser(send, activity.getString(R.string.share_title, name)));
            return true;
        } catch (ActivityNotFoundException e) {
            Toast.makeText(activity, R.string.no_app, Toast.LENGTH_LONG).show();
            return false;
        }
    }

    /** A large file is said with its size before it is fetched to be shared (MVP_draft.md 64.2). */
    private void askToShare(String address, String pageName, long total, Answer answer) {
        activity.runOnUiThread(() -> {
            AlertDialog dialog = new AlertDialog.Builder(activity)
                .setMessage(activity.getString(R.string.share_large, SiteFiles.size(total)))
                .setPositiveButton(R.string.share_continue, (d, w) -> {
                    say(R.string.share_started);
                    pool.execute(() -> run(Kind.SHARE, address, userAgent, null, null, pageName, true, answer));
                })
                .setNegativeButton(R.string.connect_cancel, (d, w) -> {
                    if (answer != null) answer.done(false);
                })
                .setOnCancelListener((d) -> {
                    if (answer != null) answer.done(false);
                })
                .create();
            dialog.show();
            View decor = dialog.getWindow() != null ? dialog.getWindow().getDecorView() : null;
            if (decor != null) decor.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        });
    }

    // --- the progress notice, when the person allows the application's notices -----------------------------

    private int progressStart(String name) {
        int id = NOTICES.incrementAndGet();
        progress(id, name, 0, 0);
        return id;
    }

    private void progress(int id, String name, long done, long total) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(activity);
        if (!manager.areNotificationsEnabled()) return;
        NotificationCompat.Builder b = new NotificationCompat.Builder(activity, CHANNEL)
            .setSmallIcon(R.drawable.ic_notice)
            .setContentTitle(name)
            .setContentText(activity.getString(R.string.downloads_progress))
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setSilent(true);
        if (total > 0) b.setProgress(1000, (int) Math.min(1000, done * 1000 / total), false);
        else b.setProgress(0, 0, true);
        try {
            manager.notify(id, b.build());
        } catch (SecurityException ignored) {
            // notices not allowed: the toasts say it instead
        }
    }

    private void progressEnd(int id) {
        if (id != 0) NotificationManagerCompat.from(activity).cancel(id);
    }

    private void say(int text) {
        activity.runOnUiThread(() -> Toast.makeText(activity, text, Toast.LENGTH_LONG).show());
    }
}
