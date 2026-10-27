package sa.commshub.app;

import android.app.Application;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

/**
 * The application's process. Its channels are made here, so they exist before the first push and show in
 * Android's settings; and Firebase is started here, so a push reaches the phone with the application closed.
 * Firebase is started only when the build was given the owner's Firebase project (mobile/README.md): its four
 * public identifiers come from `google-services.json` at build time, for this build's own application id, and no
 * file of Firebase is in the repository. Without them the application offers no token and receives nothing.
 */
public class ShellApp extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        PushService.channels(this);
        if (configured() && FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(
                this,
                new FirebaseOptions.Builder()
                    .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                    .setApiKey(BuildConfig.FIREBASE_API_KEY)
                    .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                    .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                    .build()
            );
        }
    }

    /** Whether this build was given a Firebase project. */
    static boolean configured() {
        return !BuildConfig.FIREBASE_APP_ID.isEmpty() && !BuildConfig.FIREBASE_API_KEY.isEmpty() && !BuildConfig.FIREBASE_PROJECT_ID.isEmpty() && !BuildConfig.FIREBASE_SENDER_ID.isEmpty();
    }
}
