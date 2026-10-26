package sa.commshub.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * «مركز الاتصال المؤسسي» on Android (MVP_draft.md 64; Android_Build_Plan.md A2): Capacitor's window on the
 * live site, with the application's rules. It holds no secret: signing in is the site's own form, and the
 * session is the site's cookie in this application's own storage.
 *
 * The site's pages are laid out for a phone already, so the window keeps them clear of the phone's status
 * bar, its gesture or button bar, and the keyboard, by padding the web view by exactly those (the site's
 * styles are not changed for the application).
 */
public class MainActivity extends BridgeActivity {

    private Downloads downloads;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        WebView web = bridge.getWebView();
        bridge.setWebViewClient(new ShellWebViewClient(bridge, this));
        downloads = new Downloads(this);
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> downloads.start(url, userAgent, disposition, mime));
        clearOfSystemBars((View) web.getParent());
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = bridge.getWebView();
                if (w.canGoBack()) {
                    w.goBack();
                } else {
                    // The first page: leave, as Android does for any application.
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }

    /** Before the bridge loads the first page: the identity script and the narrowed permissions. */
    @Override
    protected void load() {
        WebView web = findViewById(com.getcapacitor.android.R.id.webview);
        if (web != null) Shell.identify(web);
        super.load();
        if (bridge != null) bridge.getWebView().setWebChromeClient(new ShellChromeClient(bridge));
    }

    @Override
    public void onPause() {
        super.onPause();
        // The session survives the application being closed from the recent list.
        CookieManager.getInstance().flush();
    }

    private void clearOfSystemBars(View holder) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        holder.setBackgroundColor(ContextCompat.getColor(this, R.color.bars));
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(!night);
        controller.setAppearanceLightNavigationBars(!night);
        ViewCompat.setOnApplyWindowInsetsListener(holder, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(holder);
    }

    /** Another site, or a page meant for outside people: the phone's browser. */
    static void openOutside(Activity activity, String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            activity.runOnUiThread(() -> Toast.makeText(activity, R.string.no_app, Toast.LENGTH_LONG).show());
        }
    }

    void openMail(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_SENDTO, Uri.parse(url)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_LONG).show();
        }
    }

    /** An outside connection finishes in the browser, after the desktop's note (MVP_draft.md 63). */
    void confirmConnect(String url) {
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setMessage(R.string.connect_note)
            .setPositiveButton(R.string.connect_continue, (d, w) -> openOutside(this, url))
            .setNegativeButton(R.string.connect_cancel, null)
            .create();
        dialog.show();
        View decor = dialog.getWindow() != null ? dialog.getWindow().getDecorView() : null;
        if (decor != null) decor.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
    }
}
