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

    /** The topmost open <dialog> of the page gets the cancel the Escape key would send; true when there was one. */
    static final String CANCEL_DIALOG =
        "(function () { var all = document.querySelectorAll('dialog[open]'); var d = all[all.length - 1]; if (!d) return false;"
            + " var e = new Event('cancel', { cancelable: true }); d.dispatchEvent(e); if (!e.defaultPrevented) d.close(); return true; })()";

    private Downloads downloads;
    /** Whether the window is in front: a push then refreshes the page instead of showing a notice (PushService). */
    private static volatile boolean front;

    static boolean inFront() {
        return front;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The application's own methods behind window.commsHubNative, before Capacitor builds its bridge.
        registerPlugin(CommsHubShell.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        WebView web = bridge.getWebView();
        bridge.setWebViewClient(new ShellWebViewClient(bridge, this));
        downloads = new Downloads(this, web.getSettings().getUserAgentString());
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> downloads.start(url, userAgent, disposition, mime));
        clearOfSystemBars((View) web.getParent());
        // Opened by a tapped push (PushService) or a link of the site (A6): its page instead of the first one.
        openPushed(getIntent());
        openLink(getIntent());
        AppLock.hideFromRecents(this);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = bridge.getWebView();
                // An open window of the page is asked first, as the Escape key would: it closes, or stays when
                // it may not be put off (the update that must be installed). Only then does the page go back.
                w.evaluateJavascript(CANCEL_DIALOG, (handled) -> {
                    if ("true".equals(handled)) return;
                    if (w.canGoBack()) {
                        w.goBack();
                    } else {
                        // The first page: leave, as Android does for any application.
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                });
            }
        });
    }

    /** The site's files on the phone, for the bridge's download and share (A4). */
    Downloads downloads() {
        return downloads;
    }

    /** Before the bridge loads the first page: the identity script and the narrowed permissions. */
    @Override
    protected void load() {
        WebView web = findViewById(com.getcapacitor.android.R.id.webview);
        if (web != null) Shell.identify(web);
        super.load();
        if (bridge != null) {
            bridge.getWebView().setWebChromeClient(new ShellChromeClient(bridge));
            Shell.narrow(bridge.getWebView());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openPushed(intent);
        openLink(intent);
        Incoming.receive(this, intent);
    }

    /** «استلام ملفات» (A7), once the files shared in are held: the page on the address this build opens. */
    void openSharePage() {
        if (bridge == null) return;
        String target = Navigation.originOf(Navigation.parse(bridge.getServerUrl())) + "/share";
        if (!Navigation.isAllowed(target, Shell.ALLOWED)) return;
        WebView w = bridge.getWebView();
        w.post(() -> w.loadUrl(target));
    }

    /**
     * A link of the site that Android handed to the application (A6): the same page and query on the address this
     * build opens, checked again by Links (the claimed pages only, no dot segment) and by the compiled list.
     */
    private void openLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null || bridge == null) return;
        String link = intent.getData().toString();
        intent.setData(null);
        String opens = Navigation.originOf(Navigation.parse(bridge.getServerUrl()));
        String target = Links.target(link, BuildConfig.LINK_SITE, opens);
        if (target == null || !Navigation.isAllowed(target, Shell.ALLOWED)) return;
        WebView w = bridge.getWebView();
        w.post(() -> w.loadUrl(target));
    }

    private void openPushed(Intent intent) {
        String go = intent != null ? intent.getStringExtra(PushService.EXTRA_GO) : null;
        if (go == null) return;
        boolean ours = PushService.ours(this, intent);
        intent.removeExtra(PushService.EXTRA_GO);
        intent.removeExtra(PushService.EXTRA_KEY);
        // Another application may start this window with any extra; only the application's own notice opens a page.
        if (ours) CommsHubShell.open(go);
    }

    @Override
    public void onResume() {
        super.onResume();
        front = true;
        // The application lock, when the person turned it on (A6).
        AppLock.returned(this);
        // The update's feed when due, and Android's confirmation of an update if it is still waiting (A3).
        if (AppUpdate.offered()) AppUpdate.get(this).resumed(this);
        // Google Play's copy asks Play instead, and shows again an immediate update Play left under way (A8).
        if (PlayUpdate.offered()) PlayUpdate.get(this).resumed(this);
    }

    @Override
    public void onPause() {
        super.onPause();
        front = false;
        AppLock.left();
        // The session survives the application being closed from the recent list.
        CookieManager.getInstance().flush();
    }

    @Override
    public void onDestroy() {
        AppLock.destroyed();
        super.onDestroy();
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
