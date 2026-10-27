package sa.commshub.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.HashMap;
import java.util.Map;

/**
 * The check package only (src/qa; qa/android-push.cjs): a push handed to the application as Firebase would hand
 * it, through the same PushService.handle, so the check can see what is shown, in which channel, and what a tap
 * opens without a Firebase project. No release or development build has this receiver.
 */
public class QaPush extends BroadcastReceiver {

    private static final String[] FIELDS = { "kind", "tier", "title", "body", "go", "tag" };

    @Override
    public void onReceive(Context context, Intent intent) {
        Map<String, String> d = new HashMap<>();
        for (String f : FIELDS) {
            String v = intent.getStringExtra(f);
            if (v != null) d.put(f, v);
        }
        PushService.handle(context, d);
    }
}
