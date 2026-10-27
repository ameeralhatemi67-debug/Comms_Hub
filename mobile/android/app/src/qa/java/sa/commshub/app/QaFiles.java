package sa.commshub.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;

/**
 * The check package only (src/qa; qa/android-upload.cjs): files to share into the application, as another
 * application's provider would hand them. Android does not let the shell grant another application's files to this
 * one, so the check shares from here instead, under an authority of its own (never the application's FileProvider,
 * which Incoming refuses). Each file is made as it is read, from its size and a seed, by the same xorshift the check
 * computes, so nothing is written to the emulator's storage and the check knows every byte:
 * `content://sa.commshub.app.qa.qafiles/<size>/<seed>/<name>`. No release or development build has this provider.
 */
public class QaFiles extends ContentProvider {

    @Override
    public boolean onCreate() {
        return true;
    }

    private static long sizeOf(Uri uri) {
        List<String> p = uri.getPathSegments();
        return p.size() == 3 ? Long.parseLong(p.get(0)) : -1;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        List<String> p = uri.getPathSegments();
        if (p.size() != 3) return null;
        MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        c.addRow(new Object[] { p.get(2), sizeOf(uri) });
        return c;
    }

    @Override
    public String getType(Uri uri) {
        List<String> p = uri.getPathSegments();
        String name = p.size() == 3 ? p.get(2) : "";
        return name.endsWith(".mp4") ? "video/mp4" : name.endsWith(".txt") ? "text/plain" : "application/octet-stream";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        List<String> p = uri.getPathSegments();
        if (p.size() != 3 || !"r".equals(mode)) throw new FileNotFoundException();
        long size = Long.parseLong(p.get(0));
        int seed = Integer.parseInt(p.get(1));
        try {
            ParcelFileDescriptor[] pipe = ParcelFileDescriptor.createPipe();
            new Thread(() -> {
                try (OutputStream out = new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])) {
                    int x = seed == 0 ? 1 : seed;
                    byte[] buf = new byte[64 * 1024];
                    long left = size;
                    while (left > 0) {
                        int n = (int) Math.min(buf.length, left);
                        for (int i = 0; i < n; i++) {
                            x ^= x << 13;
                            x ^= x >>> 17;
                            x ^= x << 5;
                            buf[i] = (byte) x;
                        }
                        out.write(buf, 0, n);
                        left -= n;
                    }
                } catch (IOException ignored) {
                    // the reader went away
                }
            }).start();
            return pipe[0];
        } catch (IOException e) {
            throw new FileNotFoundException();
        }
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        return 0;
    }
}
