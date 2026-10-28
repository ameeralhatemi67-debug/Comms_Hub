package sa.commshub.app;

import android.app.Activity;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.appupdate.testing.FakeAppUpdateManager;
import com.google.android.play.core.install.InstallState;
import com.google.android.play.core.install.model.AppUpdateType;

/**
 * Google Play's own updates (MVP_draft.md 64.6; Android_Build_Plan.md A8), in Google Play's copy only; the APK
 * channel updates itself (AppUpdate, A3) and has an empty PlayUpdate of its own (src/direct). Play decides whether
 * there is an update and installs it. The application asks Play when it starts and when it comes back to the front,
 * at most every four hours unless an update is under way, and reports what Play says to the page, which draws it in
 * the same update window as the APK channel's (src/lib/native/play-update.ts).
 *
 * The page asks for one of two things. A flexible update is downloaded by Play while the person keeps working, then
 * completed when the person chooses to restart. The immediate update, asked only when the site says an update is
 * required, is Play's own full screen. Completing an update restarts the application, so it waits while a file is
 * being sent in the background (A7). Play's own window asks the person every time; nothing is installed silently.
 *
 * The check package asks Play's FakeAppUpdateManager instead (BuildConfig.PLAY_STAND_IN), which the check drives
 * (src/playQa/QaPlay.java): an application that did not come from Play has nothing to ask Play about.
 */
final class PlayUpdate {

    static final long EVERY = 4L * 60 * 60 * 1000;
    private static PlayUpdate instance;

    private final AppUpdateManager manager;
    private volatile AppUpdateInfo info;
    private volatile long checkedAt;
    private volatile String state = "checking";
    private volatile String why;
    private volatile long done;
    private volatile long total;
    /** Play's window is open, asked by the page or resumed by the application. */
    private volatile boolean asking;
    private final String current;

    private PlayUpdate(Context context) {
        Context app = context.getApplicationContext();
        manager = BuildConfig.PLAY_STAND_IN ? new FakeAppUpdateManager(app) : AppUpdateManagerFactory.create(app);
        manager.registerListener(this::installState);
        current = Shell.version(app);
    }

    static synchronized PlayUpdate get(Context context) {
        if (instance == null) instance = new PlayUpdate(context);
        return instance;
    }

    /** Google Play's copy is updated by Play. */
    static boolean offered() {
        return true;
    }

    /** The check package's stand-in, for the check alone (QaPlay); null in every other build. */
    FakeAppUpdateManager standIn() {
        return BuildConfig.PLAY_STAND_IN ? (FakeAppUpdateManager) manager : null;
    }

    private void installState(InstallState s) {
        done = s.bytesDownloaded();
        total = s.totalBytesToDownload();
        String stop = PlayStates.stopped(s.installStatus());
        if (stop != null) why = stop;
        AppUpdateInfo i = info;
        state = PlayStates.state(i != null ? i.updateAvailability() : 0, s.installStatus());
        if (stop != null) refresh(null);
    }

    /** Asks Play again; with an activity in front, an immediate update Play left under way is shown again. */
    void refresh(Activity front) {
        manager.getAppUpdateInfo()
            .addOnSuccessListener((i) -> {
                info = i;
                checkedAt = System.currentTimeMillis();
                done = i.bytesDownloaded();
                total = i.totalBytesToDownload();
                state = PlayStates.state(i.updateAvailability(), i.installStatus());
                if (front != null && !asking && i.updateAvailability() == PlayStates.IN_PROGRESS) flow(front, i, AppUpdateType.IMMEDIATE);
            })
            .addOnFailureListener((e) -> {
                // Not installed from Play, or no Play on this phone: there is nothing to offer.
                checkedAt = System.currentTimeMillis();
                state = "unavailable";
            });
    }

    JSObject status() {
        AppUpdateInfo i = info;
        boolean has = i != null && (i.updateAvailability() == PlayStates.AVAILABLE || i.updateAvailability() == PlayStates.IN_PROGRESS);
        JSObject s = new JSObject();
        s.put("state", state);
        s.put("why", why);
        s.put("current", current);
        s.put("code", has ? i.availableVersionCode() : null);
        s.put("percent", PlayStates.percent(done, total));
        s.put("priority", i != null ? i.updatePriority() : 0);
        s.put("staleDays", i != null ? i.clientVersionStalenessDays() : null);
        s.put("flexible", has && i.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
        s.put("immediate", has && i.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
        return s;
    }

    /** 'started', 'busy' while one is under way, 'uploading' while a file is sent (immediate only), 'unavailable' when Play has none of that kind. */
    String start(Activity activity, String mode) {
        AppUpdateInfo i = info;
        int type = "immediate".equals(mode) ? AppUpdateType.IMMEDIATE : AppUpdateType.FLEXIBLE;
        if (i == null || i.updateAvailability() != PlayStates.AVAILABLE || !i.isUpdateTypeAllowed(type)) return "unavailable";
        if (asking || state.equals("pending") || state.equals("downloading") || state.equals("installing")) return "busy";
        // The immediate update restarts the application at its end: it waits while a file is being sent (A7).
        if (type == AppUpdateType.IMMEDIATE && Uploads.busy(activity)) return "uploading";
        why = null;
        activity.runOnUiThread(() -> flow(activity, i, type));
        return "started";
    }

    private void flow(Activity activity, AppUpdateInfo i, int type) {
        asking = true;
        try {
            manager.startUpdateFlow(i, activity, AppUpdateOptions.newBuilder(type).build()).addOnCompleteListener((t) -> {
                asking = false;
                why = t.isSuccessful() && t.getResult() != null ? PlayStates.flowEnded(t.getResult()) : "failed";
                // Each answer of Play starts one flow only: ask again for the next.
                refresh(null);
            });
        } catch (Exception e) {
            asking = false;
            why = "failed";
        }
    }

    /** A flexible update Play has downloaded: 'started', 'uploading' while a file is sent, 'nothing' when none is ready. */
    String complete(Activity activity) {
        if (!"downloaded".equals(state)) return "nothing";
        if (Uploads.busy(activity)) return "uploading";
        manager.completeUpdate().addOnFailureListener((e) -> {
            why = "failed";
            refresh(null);
        });
        return "started";
    }

    /** When the application comes back to the front: Play is asked again when due, or at once while an update is under way. */
    void resumed(Activity activity) {
        boolean underWay = !state.equals("none") && !state.equals("available") && !state.equals("unavailable");
        if (underWay || info == null || System.currentTimeMillis() - checkedAt >= EVERY) refresh(activity);
    }
}
