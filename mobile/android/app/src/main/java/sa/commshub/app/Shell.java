package sa.commshub.app;

import android.content.Context;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;

/**
 * The compiled address list and the identity script. A release build holds the production address alone;
 * a development or check build adds the emulator's address of the local site. The list comes from the
 * build type (app/build.gradle) and no setting, switch or variable widens it at run time.
 */
final class Shell {

    static final List<String> ALLOWED = Collections.unmodifiableList(Arrays.asList(BuildConfig.ALLOWED_ORIGINS.split(",")));

    /** The address of the page in front, as the web view last reported it; read by the native methods, which run off the web view's thread. */
    private static volatile String current;

    private Shell() {}

    /** The version installed, as Android knows it. */
    static String version(Context context) {
        try {
            String v = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
            return v != null ? v : BuildConfig.VERSION_NAME;
        } catch (Exception e) {
            return BuildConfig.VERSION_NAME;
        }
    }

    static void setCurrent(String url) {
        current = url;
    }

    static String currentUrl() {
        return current;
    }

    /**
     * Gives the pages of the compiled addresses `window.commsHubNative`. A WebView too old for scripts at
     * document start shows the site as a browser would: the site then offers nothing of the application.
     */
    static void identify(WebView web) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        WebViewCompat.addDocumentStartJavaScript(web, Identity.script(version(web.getContext()), AppUpdate.offered()), new HashSet<>(ALLOWED));
    }
}
