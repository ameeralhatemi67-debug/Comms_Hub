package sa.commshub.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.widget.Toast;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Downloads (MVP_draft.md 64, «التنزيلات»). A file of the site is fetched by the application itself, with
 * the web view's own cookies, and written to the phone's Downloads folder. The session never leaves this
 * application's process: not to the system's download service, whose database would keep the request's
 * headers, and not to another address, since a redirect away from the compiled list is followed without the
 * cookie. A file made inside the page (a blob or data address) cannot be fetched from outside the page, so
 * the person is told where to save it instead.
 */
final class Downloads {

    private static final int MAX_REDIRECTS = 5;
    private final Activity activity;
    private final ExecutorService pool = Executors.newFixedThreadPool(2);

    Downloads(Activity activity) {
        this.activity = activity;
    }

    void start(String url, String userAgent, String disposition, String mime) {
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
        pool.execute(() -> fetch(url, userAgent, disposition, mime));
    }

    private void fetch(String address, String userAgent, String disposition, String mime) {
        Uri row = null;
        ContentResolver resolver = activity.getContentResolver();
        HttpURLConnection conn = null;
        String at = address;
        try {
            for (int hop = 0; ; hop++) {
                conn = (HttpURLConnection) new URL(at).openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(30_000);
                conn.setReadTimeout(60_000);
                if (userAgent != null) conn.setRequestProperty("User-Agent", userAgent);
                if (Navigation.isAllowed(at, Shell.ALLOWED)) {
                    String cookie = CookieManager.getInstance().getCookie(at);
                    if (cookie != null) conn.setRequestProperty("Cookie", cookie);
                }
                int code = conn.getResponseCode();
                if (code >= 300 && code < 400 && conn.getHeaderField("Location") != null && hop < MAX_REDIRECTS) {
                    at = URI.create(at).resolve(conn.getHeaderField("Location")).toString();
                    conn.disconnect();
                    continue;
                }
                if (code != 200) throw new IllegalStateException("status " + code);
                break;
            }
            String type = conn.getContentType() != null ? conn.getContentType().split(";")[0].trim() : mime;
            String name = FileNames.fromDisposition(conn.getHeaderField("Content-Disposition"));
            if (name == null) name = FileNames.fromDisposition(disposition);
            if (name == null) name = FileNames.fromUrl(at);
            if (name == null) {
                String ext = type == null ? null : MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
                name = activity.getString(R.string.download_fallback_name) + (ext != null ? "." + ext : "");
            }
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            if (type != null) values.put(MediaStore.Downloads.MIME_TYPE, type);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            row = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (row == null) throw new IllegalStateException("no row");
            try (InputStream in = conn.getInputStream(); OutputStream out = resolver.openOutputStream(row)) {
                if (out == null) throw new IllegalStateException("no stream");
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(row, done, null, null);
            final String saved = name;
            activity.runOnUiThread(() -> Toast.makeText(activity, activity.getString(R.string.download_done, saved), Toast.LENGTH_LONG).show());
        } catch (Exception e) {
            if (row != null) {
                try {
                    resolver.delete(row, null, null);
                } catch (Exception ignored) {
                    // nothing more to undo
                }
            }
            say(R.string.download_failed);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void say(int text) {
        activity.runOnUiThread(() -> Toast.makeText(activity, text, Toast.LENGTH_LONG).show());
    }
}
