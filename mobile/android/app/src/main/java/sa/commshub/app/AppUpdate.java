package sa.commshub.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The application's own updates (MVP_draft.md 64.1; Android_Build_Plan.md A3). It reads latest.json from
 * its compiled feed when it starts and, at most every four hours, when it comes back to the front, and hands
 * the text to the page, which shows the update window. When the person asks for the update, the APK is
 * fetched from the same feed and checked before anything is installed: its size and SHA-256 as latest.json
 * states them, the application's own id, a newer version, and the application's own signing key. Android
 * then asks the person to confirm the installation; nothing is installed silently.
 */
final class AppUpdate {

    static final long EVERY = 4L * 60 * 60 * 1000;
    static final String INSTALLED = "sa.commshub.app.INSTALL_STATUS";
    private static AppUpdate instance;

    private final Context context;
    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private volatile String feed;
    private volatile long checkedAt;
    private volatile String state = "idle";
    private volatile Integer percent;
    private volatile String version;
    private volatile String why;
    /** Android's confirmation, kept when it could not be shown at once (the application was not in front). */
    private volatile Intent pendingConfirm;

    private AppUpdate(Context context) {
        this.context = context.getApplicationContext();
    }

    static synchronized AppUpdate get(Context context) {
        if (instance == null) instance = new AppUpdate(context);
        return instance;
    }

    /** Only the APK channel updates itself; Google Play's copy is updated by Play. */
    static boolean offered() {
        return "direct".equals(BuildConfig.CHANNEL);
    }

    void checkIfDue() {
        if (!offered()) return;
        if (feed != null && System.currentTimeMillis() - checkedAt < EVERY) return;
        pool.execute(this::readFeed);
    }

    private void readFeed() {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(BuildConfig.UPDATE_FEED + "/latest.json").openConnection();
            conn.setConnectTimeout(20_000);
            conn.setReadTimeout(20_000);
            conn.setUseCaches(false);
            if (conn.getResponseCode() != 200) return;
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream text = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    text.write(buffer, 0, n);
                    if (text.size() > 20_000) return;
                }
                feed = text.toString(StandardCharsets.UTF_8.name());
                checkedAt = System.currentTimeMillis();
            }
        } catch (Exception ignored) {
            // no connection or no release yet: the next check tries again
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    JSObject status() {
        JSObject s = new JSObject();
        s.put("state", state);
        s.put("percent", percent);
        s.put("version", version);
        s.put("why", why);
        s.put("current", Shell.version(context));
        s.put("feed", feed);
        s.put("installAllowed", context.getPackageManager().canRequestPackageInstalls());
        return s;
    }

    /** 'started', 'busy' while one is under way, 'permission' when Android must first allow it, 'refused' for a release that does not qualify. */
    String start(Activity activity, String wanted, String file, long size, String sha) {
        if (!offered() || !Releases.acceptable(wanted, file, size, sha, Shell.version(context))) return "refused";
        if (state.equals("downloading") || state.equals("verifying") || state.equals("installing")) return "busy";
        // Installing restarts the application: it waits while a file is being sent in the background (A7).
        if (Uploads.busy(activity)) return "busy";
        if (!context.getPackageManager().canRequestPackageInstalls()) {
            activity.runOnUiThread(() -> {
                try {
                    activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName())));
                } catch (Exception ignored) {
                    // the page explains where the setting is
                }
            });
            return "permission";
        }
        state = "downloading";
        percent = 0;
        version = wanted;
        why = null;
        pool.execute(() -> fetchCheckInstall(file, size, sha));
        return "started";
    }

    private void fail(String reason) {
        state = "failed";
        why = reason;
        percent = null;
    }

    private void fetchCheckInstall(String file, long size, String sha) {
        File dir = new File(context.getCacheDir(), "updates");
        File part = new File(dir, file + ".part");
        File apk = new File(dir, file);
        HttpURLConnection conn = null;
        try {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                f.delete();
            conn = (HttpURLConnection) new URL(BuildConfig.UPDATE_FEED + "/" + URLEncoder.encode(file, "UTF-8")).openConnection();
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(60_000);
            if (conn.getResponseCode() != 200) {
                fail("network");
                return;
            }
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long got = 0;
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    got += n;
                    if (got > size) {
                        fail("mismatch");
                        return;
                    }
                    digest.update(buffer, 0, n);
                    out.write(buffer, 0, n);
                    percent = (int) Math.min(99, got * 100 / size);
                }
            }
            state = "verifying";
            if (got != size || !hex(digest.digest()).equals(sha)) {
                fail("mismatch");
                return;
            }
            if (!part.renameTo(apk)) {
                fail("space");
                return;
            }
            String problem = verify(apk);
            if (problem != null) {
                fail(problem);
                return;
            }
            install(apk);
        } catch (Exception e) {
            fail("network");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** null when the APK is this application, newer, signed with this application's key; else why not. */
    private String verify(File apk) throws Exception {
        PackageManager pm = context.getPackageManager();
        PackageInfo theirs = pm.getPackageArchiveInfo(apk.getPath(), PackageManager.GET_SIGNING_CERTIFICATES);
        if (theirs == null || !context.getPackageName().equals(theirs.packageName)) return "package";
        PackageInfo mine = pm.getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
        if (theirs.getLongVersionCode() <= mine.getLongVersionCode()) return "version";
        if (theirs.signingInfo == null || mine.signingInfo == null) return "signature";
        if (!signers(theirs.signingInfo.getApkContentsSigners()).equals(signers(mine.signingInfo.getApkContentsSigners()))) return "signature";
        return null;
    }

    private static Set<String> signers(Signature[] all) {
        Set<String> out = new HashSet<>();
        if (all != null) for (Signature s : all) out.add(Arrays.toString(s.toByteArray()));
        return out;
    }

    private void install(File apk) throws Exception {
        state = "installing";
        percent = 100;
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(context.getPackageName());
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (OutputStream out = session.openWrite("update.apk", 0, apk.length()); InputStream in = new FileInputStream(apk)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                session.fsync(out);
            }
            Intent done = new Intent(context, InstallReceiver.class).setAction(INSTALLED);
            PendingIntent pending = PendingIntent.getBroadcast(context, id, done, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            session.commit(pending.getIntentSender());
        }
    }

    /** From InstallReceiver: Android's confirmation to show, or how the installation ended. */
    void installStatus(int status, Intent confirm) {
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION && confirm != null) {
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(confirm);
            } catch (Exception e) {
                pendingConfirm = confirm;
            }
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            state = "idle";
        } else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
            fail("cancelled");
        } else {
            fail("install");
        }
    }

    /** When the application comes back to the front: a confirmation left waiting, and the feed if due. */
    void resumed(Activity activity) {
        Intent confirm = pendingConfirm;
        if (confirm != null) {
            pendingConfirm = null;
            activity.startActivity(confirm);
        }
        checkIfDue();
    }

    private static String hex(byte[] bytes) {
        StringBuilder b = new StringBuilder(bytes.length * 2);
        for (byte x : bytes) b.append(String.format("%02x", x));
        return b.toString();
    }
}
