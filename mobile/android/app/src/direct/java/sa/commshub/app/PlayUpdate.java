package sa.commshub.app;

import android.app.Activity;
import android.content.Context;
import com.getcapacitor.JSObject;

/**
 * The APK channel has no Google Play: it updates itself (AppUpdate, A3), and this copy carries no part of Play's
 * library. The same methods as Google Play's copy (src/play/PlayUpdate.java, A8), answering that there is nothing;
 * the bridge offers `playUpdate` only where offered() is true.
 */
final class PlayUpdate {

    private static final PlayUpdate NONE = new PlayUpdate();

    private PlayUpdate() {}

    static PlayUpdate get(Context context) {
        return NONE;
    }

    static boolean offered() {
        return false;
    }

    JSObject status() {
        return new JSObject();
    }

    String start(Activity activity, String mode) {
        return "unavailable";
    }

    String complete(Activity activity) {
        return "nothing";
    }

    void resumed(Activity activity) {
        // nothing to ask
    }
}
