package sa.commshub.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

/**
 * The application lock (MVP_draft.md 64.4; Android_Build_Plan.md A6, decision M-12): off by default. When the
 * person turns it on, the application asks for the fingerprint or the phone's screen lock when it opens and when it
 * comes back after BuildConfig.LOCK_AFTER_MS away (five minutes; five seconds in the check package). Until then a
 * native screen of its own covers the page. Turning it on or off asks too. It guards this phone's window only: the
 * session and every rule stay the site's.
 */
final class AppLock {

    /** What Android accepts as proof: a fingerprint or face, or the phone's own PIN, pattern or password. */
    static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
    private static final String PREFS = "lock";

    /** When the window last left the front, by the phone's clock since start; -1 before it was ever in front. */
    private static long leftAt = -1;
    /** While Android asks, the window may pause and resume; that is not a return. */
    private static boolean asking;
    private static View cover;

    interface Done {
        void done(boolean ok);
    }

    private AppLock() {}

    static boolean on(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false);
    }

    static boolean available(Context c) {
        return BiometricManager.from(c).canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    private static void store(Context c, boolean on) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putBoolean("on", on).apply();
    }

    /** The window left the front. */
    static void left() {
        if (!asking) leftAt = SystemClock.elapsedRealtime();
    }

    /** The window is in front again: locked when the lock is on and it opened now or was away long enough. */
    static void returned(FragmentActivity a) {
        hideFromRecents(a);
        if (asking || cover != null || !on(a)) return;
        if (leftAt < 0 || SystemClock.elapsedRealtime() - leftAt >= BuildConfig.LOCK_AFTER_MS) lock(a);
    }

    /** With the lock on, Android's list of recent applications shows no picture of the page (Android 13 and newer). */
    static void hideFromRecents(FragmentActivity a) {
        if (Build.VERSION.SDK_INT >= 33) a.setRecentsScreenshotEnabled(!on(a));
    }

    /** Covers the page, then asks. */
    static void lock(FragmentActivity a) {
        if (cover == null) {
            cover = coverFor(a);
            a.addContentView(cover, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        ask(a, a.getString(R.string.lock_prompt_title), (ok) -> {
            if (ok) unlock();
        });
    }

    private static void unlock() {
        if (cover != null && cover.getParent() instanceof ViewGroup) ((ViewGroup) cover.getParent()).removeView(cover);
        cover = null;
    }

    static boolean locked() {
        return cover != null;
    }

    /** The window is gone: its cover with it (a new window is covered again if the lock is on). */
    static void destroyed() {
        cover = null;
        asking = false;
    }

    /** Turning the lock on or off, after Android has asked; answers whether it changed. */
    static void set(FragmentActivity a, boolean on, Done done) {
        if (on && !available(a)) {
            done.done(false);
            return;
        }
        ask(a, a.getString(on ? R.string.lock_prompt_on : R.string.lock_prompt_off), (ok) -> {
            if (ok) {
                store(a, on);
                hideFromRecents(a);
                leftAt = SystemClock.elapsedRealtime();
            }
            done.done(ok);
        });
    }

    private static void ask(FragmentActivity a, String title, Done done) {
        if (asking) return;
        asking = true;
        BiometricPrompt prompt = new BiometricPrompt(a, ContextCompat.getMainExecutor(a), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                asking = false;
                done.done(true);
            }

            @Override
            public void onAuthenticationError(int code, CharSequence message) {
                asking = false;
                done.done(false);
            }
        });
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(a.getString(R.string.lock_prompt_sub))
            .setAllowedAuthenticators(AUTHENTICATORS)
            .build();
        prompt.authenticate(info);
    }

    /** The native screen over the page: the rosette, «المركز مقفل» and «فتح القفل». */
    private static View coverFor(FragmentActivity a) {
        FrameLayout root = new FrameLayout(a);
        root.setBackgroundColor(ContextCompat.getColor(a, R.color.bars));
        root.setClickable(true);
        root.setFocusable(true);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setContentDescription(a.getString(R.string.lock_title));
        LinearLayout col = new LinearLayout(a);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(a, 24);
        col.setPadding(pad, pad, pad, pad);
        ImageView mark = new ImageView(a);
        mark.setImageResource(R.mipmap.ic_launcher_round);
        col.addView(mark, new LinearLayout.LayoutParams(dp(a, 88), dp(a, 88)));
        TextView title = new TextView(a);
        title.setText(R.string.lock_title);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTextColor(0xFFFFFFFF);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(a, 20), 0, dp(a, 8));
        col.addView(title);
        TextView body = new TextView(a);
        body.setText(R.string.lock_body);
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        body.setTextColor(0xE6FFFFFF);
        body.setGravity(Gravity.CENTER);
        col.addView(body);
        Button open = new Button(a);
        open.setText(R.string.lock_open);
        open.setAllCaps(false);
        open.setOnClickListener((v) -> lock(a));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(a, 28);
        col.addView(open, lp);
        root.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        return root;
    }

    private static int dp(Context c, int v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }
}
