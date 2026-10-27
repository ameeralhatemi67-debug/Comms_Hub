package sa.commshub.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Pushes from the server (MVP_draft.md 64.3; supabase/migrations/*push*, src/lib/push). The server sends data
 * messages only, so this service decides what is shown: the channel by the push's kind and tier, the text the
 * server built for a lock screen (never a message's text), and the page a tap opens, checked as a path of the
 * site. While the application is in front nothing is shown: the page reads its notices again instead.
 */
public class PushService extends FirebaseMessagingService {

    static final String EXTRA_GO = "sa.commshub.app.GO";
    static final String EXTRA_KEY = "sa.commshub.app.PUSH_KEY";
    private static final String PREFS = "push";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        handle(this, message.getData());
    }

    /** A push's fields, as Firebase gives them; the check package's own receiver calls the same (src/qa). */
    static void handle(Context context, Map<String, String> d) {
        if (MainActivity.inFront()) {
            CommsHubShell.received();
            return;
        }
        String channel = Push.channelOf(d.get("kind"), d.get("tier"));
        String title = Push.text(d.get("title"));
        if (channel == null || title == null) return;
        show(context, d.get("tag"), channel, title, Push.text(d.get("body")), Push.goPath(d.get("go")));
    }

    /**
     * This application's own key, made once and kept in its private storage. The window is open to every
     * application on the phone (it is the launcher's), so a page is opened from an intent only when the intent
     * carries this key, which only the application's own notices do (MainActivity.openPushed).
     */
    static synchronized String key(Context context) {
        android.content.SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String k = p.getString("key", null);
        if (k == null || k.length() != 64) {
            byte[] b = new byte[32];
            new java.security.SecureRandom().nextBytes(b);
            StringBuilder hex = new StringBuilder();
            for (byte x : b) hex.append(String.format("%02x", x));
            k = hex.toString();
            p.edit().putString("key", k).apply();
        }
        return k;
    }

    /** Whether an intent came from one of this application's own notices. */
    static boolean ours(Context context, Intent intent) {
        String given = intent != null ? intent.getStringExtra(EXTRA_KEY) : null;
        return given != null && java.security.MessageDigest.isEqual(given.getBytes(java.nio.charset.StandardCharsets.UTF_8), key(context).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Override
    public void onNewToken(String token) {
        // Nothing is kept here: the page asks for the token and registers it at each opening and each return to the
        // application (src/lib/native/device-push.ts), and the server drops a token Firebase no longer knows.
    }

    /** The three channels, made once; Android keeps the person's own choices for each afterwards. */
    static void channels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel decide = new NotificationChannel(Push.DECIDE, context.getString(R.string.push_decide), NotificationManager.IMPORTANCE_HIGH);
        decide.setDescription(context.getString(R.string.push_decide_about));
        NotificationChannel attention = new NotificationChannel(Push.ATTENTION, context.getString(R.string.push_attention), NotificationManager.IMPORTANCE_LOW);
        attention.setDescription(context.getString(R.string.push_attention_about));
        attention.setSound(null, null);
        NotificationChannel messages = new NotificationChannel(Push.MESSAGES, context.getString(R.string.push_messages), NotificationManager.IMPORTANCE_DEFAULT);
        messages.setDescription(context.getString(R.string.push_messages_about));
        manager.createNotificationChannel(decide);
        manager.createNotificationChannel(attention);
        manager.createNotificationChannel(messages);
    }

    /** One notice; a tap opens the application at `go`, or where it was when there is none. */
    static void show(Context context, String tag, String channel, String title, String body, String go) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) return;
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (go != null) open.putExtra(EXTRA_GO, go).putExtra(EXTRA_KEY, key(context));
        String key = tag != null && tag.length() <= 200 ? tag : (channel + ":" + title + ":" + body);
        PendingIntent tap = PendingIntent.getActivity(context, key.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notice)
            .setColor(ContextCompat.getColor(context, R.color.bars))
            .setContentTitle(title)
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setCategory(Push.MESSAGES.equals(channel) ? NotificationCompat.CATEGORY_MESSAGE : NotificationCompat.CATEGORY_REMINDER);
        if (body != null) b.setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        try {
            // One notice per thing: a newer push of the same kind about the same thing replaces the older one.
            manager.notify(key, 1, b.build());
        } catch (SecurityException ignored) {
            // notices were turned off in the meantime
        }
    }
}
