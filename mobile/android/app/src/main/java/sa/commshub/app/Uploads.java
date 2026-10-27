package sa.commshub.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Library uploads the application sends in the background (MVP_draft.md 64.5; Android_Build_Plan.md A7). The page opens
 * the Drive session through the site, as a browser upload does, and hands the application a held file's token and the
 * session's address; the application sends the file in pieces (UploadWorker) and keeps where each upload stands here,
 * in its private storage, so the list survives a restart. The page registers what has arrived and then forgets it.
 * The session's address must be one the build allows (BuildConfig.UPLOAD_PREFIXES: Google Drive's upload address; the
 * check package adds its local stand-in), and it is never shown to the page again.
 */
final class Uploads {

    private static final String PREFS = "uploads";
    private static final SecureRandom RANDOM = new SecureRandom();

    private Uploads() {}

    /** Whether a session address is one the build allows. Pure. */
    static boolean allowedSession(String session, String[] prefixes) {
        if (session == null || session.length() > 4000) return false;
        for (String p : prefixes) if (!p.isEmpty() && session.startsWith(p) && session.length() > p.length()) return true;
        return false;
    }

    static String[] prefixes() {
        return BuildConfig.UPLOAD_PREFIXES.split(",");
    }

    /** Queues an upload; its id, or null when the file or the session is refused. */
    static synchronized String start(Context c, String token, String session) {
        Held.Item item = Held.get(c, token);
        if (item == null || !allowedSession(session, prefixes())) return null;
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        StringBuilder id = new StringBuilder();
        for (byte x : b) id.append(String.format("%02x", x));
        JSONObject o = new JSONObject();
        try {
            o.put("id", id.toString()).put("token", token).put("session", session).put("name", item.name).put("size", item.size)
                .put("done", 0).put("state", "queued").put("fileId", JSONObject.NULL).put("error", JSONObject.NULL);
        } catch (Exception e) {
            return null;
        }
        save(c, o);
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(UploadWorker.class)
            .setInputData(new Data.Builder().putString("id", id.toString()).build())
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .addTag("upload")
            .build();
        WorkManager.getInstance(c).enqueueUniqueWork("upload-" + id, ExistingWorkPolicy.KEEP, work);
        return id.toString();
    }

    static synchronized JSONObject get(Context c, String id) {
        String raw = prefs(c).getString(id, null);
        try {
            return raw == null ? null : new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static synchronized void save(Context c, JSONObject o) {
        prefs(c).edit().putString(o.optString("id"), o.toString()).commit();
    }

    /** What the page may see of each upload: never the session's address. */
    static synchronized JSONArray status(Context c) {
        JSONArray out = new JSONArray();
        for (Map.Entry<String, ?> e : prefs(c).getAll().entrySet()) {
            JSONObject o = get(c, e.getKey());
            if (o == null) continue;
            JSONObject seen = new JSONObject();
            try {
                seen.put("id", o.optString("id")).put("token", o.optString("token")).put("name", o.optString("name")).put("size", o.optLong("size"))
                    .put("done", o.optLong("done")).put("state", o.optString("state")).put("fileId", o.opt("fileId")).put("error", o.opt("error"));
            } catch (Exception ignored) {
                continue;
            }
            out.put(seen);
        }
        return out;
    }

    /** Stops an upload under way, or forgets one the page has registered. */
    static synchronized boolean cancel(Context c, String id) {
        if (get(c, id) == null) return false;
        WorkManager.getInstance(c).cancelUniqueWork("upload-" + id);
        prefs(c).edit().remove(id).commit();
        return true;
    }

    /** Whether an upload is queued or under way: the application's own update then waits (A3). */
    static synchronized boolean busy(Context c) {
        for (String id : prefs(c).getAll().keySet()) {
            JSONObject o = get(c, id);
            String s = o != null ? o.optString("state") : "";
            if (s.equals("queued") || s.equals("sending")) return true;
        }
        return false;
    }

    /** The held files an upload still reads, kept by Held.sweep. */
    static synchronized Set<String> tokensInUse(Context c) {
        Set<String> out = new HashSet<>();
        for (String id : prefs(c).getAll().keySet()) {
            JSONObject o = get(c, id);
            if (o != null && !o.optString("state").equals("sent")) out.add(o.optString("token"));
        }
        return out;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
