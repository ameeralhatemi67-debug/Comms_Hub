package sa.commshub.app;

import android.net.http.SslError;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;

/**
 * Capacitor's web view client with the application's rules (MVP_draft.md 64):
 * - every navigation of the page goes through {@link Navigation};
 * - Capacitor's routes for files on the phone (`/_capacitor_file_`, `/_capacitor_content_`) are refused,
 *   since the site never uses them and they would let a page read the application's own files;
 * - a page of the site that answers with an error status is the site's own answer and is shown as it is,
 *   where Capacitor would have shown the offline screen;
 * - a security certificate that is not accepted closes the page and says why.
 */
final class ShellWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;
    private final MainActivity activity;

    ShellWebViewClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.bridge = bridge;
        this.activity = activity;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String path = request.getUrl().getPath();
        if (path != null && (path.startsWith("/_capacitor_file_") || path.startsWith("/_capacitor_content_"))) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
        }
        return super.shouldInterceptRequest(view, request);
    }

    /**
     * «إعادة المحاولة» of the connection screen. Capacitor serves that screen from the application's own
     * local address, not the site's, so its button goes to this address and the application opens the
     * site again from here.
     */
    private String againUrl() {
        String errorUrl = bridge.getErrorUrl();
        return errorUrl == null ? null : errorUrl.substring(0, errorUrl.lastIndexOf('/') + 1) + "again";
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        // A frame of the page follows the page's own policy (frame-src); the rules are the page's.
        if (!request.isForMainFrame()) return false;
        String url = request.getUrl().toString();
        String again = againUrl();
        if (again != null && url.equals(again)) {
            view.loadUrl(bridge.getAppUrl());
            return true;
        }
        switch (Navigation.decide(url, Shell.ALLOWED)) {
            case STAY:
                return false;
            case BROWSER:
                MainActivity.openOutside(activity, url);
                return true;
            case NOTE_THEN_BROWSER:
                activity.confirmConnect(url);
                return true;
            case MAIL:
                activity.openMail(url);
                return true;
            default:
                return true;
        }
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        // The site's own error pages (a link that expired, a page not found) are shown as the site wrote them.
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        // A navigation the application turned into a download or refused ends this way; nothing failed.
        CharSequence description = error.getDescription();
        if (description != null && description.toString().contains("ERR_ABORTED")) return;
        super.onReceivedError(view, request, error);
    }

    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        handler.cancel();
        String errorUrl = bridge.getErrorUrl();
        if (errorUrl != null && error != null && Navigation.isAllowed(error.getUrl(), Shell.ALLOWED)) {
            view.loadUrl(errorUrl + "#certificate");
        }
    }
}
