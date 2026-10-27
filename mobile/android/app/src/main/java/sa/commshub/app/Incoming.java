package sa.commshub.app;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.widget.Toast;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;

/**
 * Files shared into the application from another one (MVP_draft.md 64.5; Android_Build_Plan.md A7): «مشاركة» then
 * «مركز الاتصال المؤسسي». Each is copied at once into a held file (Held), while Android's permission to read it lasts,
 * and the window opens «استلام ملفات» (`/share`), whose page takes the list once (`incoming.take`). Only `content://`
 * addresses of another application are read (Held.acceptable): never `file://`, never this application's own files.
 */
final class Incoming {

    private static final String PREFS = "incoming";
    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    private Incoming() {}

    /** Takes a share intent, if it is one; true when it was. */
    static boolean receive(MainActivity a, Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return false;
        List<Uri> uris = streams(intent);
        // Handled once: the same intent comes back when the window is opened again.
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.setClipData(null);
        if (uris.isEmpty()) {
            Toast.makeText(a, R.string.share_in_files_only, Toast.LENGTH_LONG).show();
            return true;
        }
        Toast.makeText(a, R.string.share_in_started, Toast.LENGTH_LONG).show();
        String own = a.getPackageName() + ".fileprovider";
        ContentResolver resolver = a.getContentResolver();
        POOL.execute(() -> {
            int ok = 0;
            for (Uri u : uris) {
                if (!Held.acceptable(u.getScheme(), u.getAuthority(), own)) continue;
                Held.Place p = null;
                try {
                    p = Held.place(a, nameOf(resolver, u));
                    try (InputStream in = resolver.openInputStream(u); OutputStream out = new FileOutputStream(p.file)) {
                        if (in == null) throw new IllegalStateException("no stream");
                        byte[] buf = new byte[256 * 1024];
                        int n;
                        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                    }
                    Held.Item item = Held.keep(a, p, resolver.getType(u));
                    add(a, item.token);
                    ok++;
                } catch (Exception e) {
                    if (p != null) Held.forget(a, p);
                }
            }
            final int count = ok;
            a.runOnUiThread(() -> {
                if (count == 0) {
                    Toast.makeText(a, R.string.share_in_failed, Toast.LENGTH_LONG).show();
                    return;
                }
                a.openSharePage();
            });
        });
        return true;
    }

    private static List<Uri> streams(Intent intent) {
        List<Uri> out = new ArrayList<>();
        try {
            if (Intent.ACTION_SEND.equals(intent.getAction())) {
                Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) out.add(u);
            } else {
                ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) for (Uri u : list) if (u != null) out.add(u);
            }
            ClipData clip = intent.getClipData();
            if (out.isEmpty() && clip != null) for (int i = 0; i < clip.getItemCount(); i++) if (clip.getItemAt(i).getUri() != null) out.add(clip.getItemAt(i).getUri());
        } catch (Exception ignored) {
            // a malformed intent brings nothing
        }
        return out.size() > 20 ? out.subList(0, 20) : out;
    }

    private static String nameOf(ContentResolver resolver, Uri u) {
        try (Cursor c = resolver.query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception ignored) {
            // the name in the address below
        }
        String last = u.getLastPathSegment();
        return last != null ? last : "ملف";
    }

    private static synchronized void add(Context c, String token) {
        String now = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("tokens", "");
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("tokens", now.isEmpty() ? token : now + "," + token).commit();
    }

    /** The files waiting for «استلام ملفات», handed over once. */
    static synchronized JSONArray take(Context c) {
        String now = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("tokens", "");
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("tokens").commit();
        JSONArray out = new JSONArray();
        for (String t : now.split(",")) {
            Held.Item item = Held.get(c, t);
            if (item != null) out.put(item.json());
        }
        return out;
    }
}
