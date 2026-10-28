package sa.commshub.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.WebResourceResponse;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * Files the application holds for the page (MVP_draft.md 64.5; Android_Build_Plan.md A7): a photo or a video taken with
 * «تصوير», or files shared into the application from another one. Each is kept in its own folder,
 * `files/held/<token>/<name>`, and named by a token of 32 random bytes; the page reads it at `/__app/file/<token>` on
 * its own address, which ShellWebViewClient answers itself, in byte ranges, and the site never serves. No file's bytes
 * cross the bridge, and no path ever reaches the page. The list is kept in the application's private storage, so a
 * background upload finds its file after a restart; a file is removed two days after it was taken, unless an upload
 * still reads it. The folder is the application's files, not its cache: Android empties every application's cache when
 * the phone runs low on space, which would take a large video away in the middle of its upload (found in A8).
 */
final class Held {

    static final String PATH = "/__app/file/";
    static final long KEEP_MS = 2L * 24 * 60 * 60 * 1000;
    private static final String PREFS = "held";
    private static final Pattern TOKEN = Pattern.compile("^[0-9a-f]{64}$");
    private static final Pattern RANGE = Pattern.compile("^bytes=(\\d*)-(\\d*)$");
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Where held files live; never the cache folder, which Android may empty at any time (above). */
    static File root(Context c) {
        return new File(c.getFilesDir(), "held");
    }

    /** A held file: its token, name, size, kind and when it was taken. */
    static final class Item {
        final String token;
        final String name;
        final long size;
        final String type;
        final long at;

        Item(String token, String name, long size, String type, long at) {
            this.token = token;
            this.name = name;
            this.size = size;
            this.type = type;
            this.at = at;
        }

        JSONObject json() {
            JSONObject o = new JSONObject();
            try {
                o.put("token", token).put("name", name).put("size", size).put("type", type);
            } catch (Exception ignored) {
                // plain values only
            }
            return o;
        }
    }

    /** A new, empty place for a file, not yet in the list: its token and its file. */
    static final class Place {
        final String token;
        final File file;

        Place(String token, File file) {
            this.token = token;
            this.file = file;
        }
    }

    private Held() {}

    static boolean isToken(String s) {
        return s != null && TOKEN.matcher(s).matches();
    }

    static String newToken() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        StringBuilder hex = new StringBuilder();
        for (byte x : b) hex.append(String.format("%02x", x));
        return hex.toString();
    }

    /** The name «تصوير» gives: «صورة-…» or «فيديو-…» with the date and time. Pure. */
    static String cameraName(boolean video, Date when) {
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(when);
        return (video ? "فيديو-" : "صورة-") + stamp + (video ? ".mp4" : ".jpg");
    }

    static Place place(Context c, String name) {
        String token = newToken();
        File dir = new File(root(c), token);
        if (!dir.mkdirs() && !dir.isDirectory()) throw new IllegalStateException("no folder");
        String safe = FileNames.safe(name);
        return new Place(token, new File(dir, safe != null ? safe : "ملف"));
    }

    static synchronized Item keep(Context c, Place p, String type) {
        Item item = new Item(p.token, p.file.getName(), p.file.length(), type != null ? type : "application/octet-stream", System.currentTimeMillis());
        JSONObject o = item.json();
        try {
            o.put("at", item.at);
        } catch (Exception ignored) {
            // plain values only
        }
        prefs(c).edit().putString(p.token, o.toString()).apply();
        return item;
    }

    static synchronized Item get(Context c, String token) {
        if (!isToken(token)) return null;
        String raw = prefs(c).getString(token, null);
        if (raw == null) return null;
        try {
            JSONObject o = new JSONObject(raw);
            return new Item(token, o.getString("name"), o.getLong("size"), o.getString("type"), o.optLong("at", 0));
        } catch (Exception e) {
            return null;
        }
    }

    static File fileOf(Context c, Item item) {
        return new File(new File(root(c), item.token), item.name);
    }

    /** Removes the files kept longer than two days, except those `inUse` (an upload still reads them). */
    static synchronized void sweep(Context c, Set<String> inUse) {
        long now = System.currentTimeMillis();
        SharedPreferences p = prefs(c);
        List<String> gone = new ArrayList<>();
        for (Map.Entry<String, ?> e : p.getAll().entrySet()) {
            Item item = get(c, e.getKey());
            if (item == null || (now - item.at > KEEP_MS && !inUse.contains(item.token))) gone.add(e.getKey());
        }
        SharedPreferences.Editor ed = p.edit();
        for (String t : gone) {
            ed.remove(t);
            delete(new File(root(c), t));
        }
        ed.apply();
    }

    static void forget(Context c, Place p) {
        delete(p.file.getParentFile());
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void delete(File f) {
        if (f == null) return;
        File[] inside = f.listFiles();
        if (inside != null) for (File x : inside) delete(x);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    /**
     * A file shared in from another application may be taken only from a `content://` address of another application's
     * provider: never `file://` (which could name this application's own private files) and never this application's
     * own provider. Pure.
     */
    static boolean acceptable(String scheme, String authority, String ownAuthority) {
        if (!"content".equalsIgnoreCase(scheme) || authority == null || authority.isEmpty()) return false;
        return !authority.equalsIgnoreCase(ownAuthority);
    }

    /**
     * The bytes a Range header asks for, as {first, last}, or null for the whole file; {-1, -1} when it cannot be
     * answered (416). Pure.
     */
    static long[] range(String header, long size) {
        if (header == null) return null;
        Matcher m = RANGE.matcher(header.trim());
        if (!m.matches() || (m.group(1).isEmpty() && m.group(2).isEmpty())) return new long[] { -1, -1 };
        long first;
        long last;
        try {
            if (m.group(1).isEmpty()) {
                long suffix = Long.parseLong(m.group(2));
                if (suffix <= 0) return new long[] { -1, -1 };
                first = Math.max(0, size - suffix);
                last = size - 1;
            } else {
                first = Long.parseLong(m.group(1));
                last = m.group(2).isEmpty() ? size - 1 : Math.min(Long.parseLong(m.group(2)), size - 1);
            }
        } catch (NumberFormatException e) {
            return new long[] { -1, -1 };
        }
        if (first >= size || last < first) return new long[] { -1, -1 };
        return new long[] { first, last };
    }

    /** The answer to `/__app/file/<token>`: the file, or the part a Range header asks for. */
    static WebResourceResponse serve(Context c, String token, String rangeHeader) {
        Item item = get(c, token);
        File f = item != null ? fileOf(c, item) : null;
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        headers.put("Accept-Ranges", "bytes");
        if (f == null || !f.isFile()) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new java.io.ByteArrayInputStream(new byte[0]));
        long size = f.length();
        long[] r = range(rangeHeader, size);
        try {
            if (r == null) {
                headers.put("Content-Length", String.valueOf(size));
                return new WebResourceResponse(item.type, null, 200, "OK", headers, new FileInputStream(f));
            }
            if (r[0] < 0) {
                headers.put("Content-Range", "bytes */" + size);
                return new WebResourceResponse(item.type, null, 416, "Range Not Satisfiable", headers, new java.io.ByteArrayInputStream(new byte[0]));
            }
            FileInputStream in = new FileInputStream(f);
            long skipped = 0;
            while (skipped < r[0]) {
                long s = in.skip(r[0] - skipped);
                if (s <= 0) break;
                skipped += s;
            }
            long length = r[1] - r[0] + 1;
            headers.put("Content-Range", "bytes " + r[0] + "-" + r[1] + "/" + size);
            headers.put("Content-Length", String.valueOf(length));
            return new WebResourceResponse(item.type, null, 206, "Partial Content", headers, limited(in, length));
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new java.io.ByteArrayInputStream(new byte[0]));
        }
    }

    private static InputStream limited(InputStream in, long length) {
        return new FilterInputStream(in) {
            private long left = length;

            @Override
            public int read() throws IOException {
                if (left <= 0) return -1;
                int b = super.read();
                if (b >= 0) left--;
                return b;
            }

            @Override
            public int read(byte[] buf, int off, int len) throws IOException {
                if (left <= 0) return -1;
                int n = super.read(buf, off, (int) Math.min(len, left));
                if (n > 0) left -= n;
                return n;
            }
        };
    }
}
