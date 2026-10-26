package sa.commshub.app;

import java.util.regex.Pattern;

/**
 * The application as the site sees it: `window.commsHubNative` (src/lib/native/index.ts; AGENTS.md, the
 * Android paragraph). The script runs at the start of every page of a compiled address, before the page's
 * own scripts, and defines the object in the top frame only, frozen and not replaceable.
 *
 * Bridge version 1 (A2) was the identity alone. Version 2 (A3) adds `appUpdate` in the APK channel. Each
 * method calls the application's plugin (CommsHubShell) through Capacitor, which hears only the main frame,
 * and passes only the plain values the plugin checks. Pure.
 */
final class Identity {

    static final int BRIDGE = 2;
    private static final Pattern SEMVER = Pattern.compile("^\\d+\\.\\d+\\.\\d+$");

    private Identity() {}

    static String script(String version, boolean appUpdate) {
        String v = version != null && SEMVER.matcher(version).matches() ? version : "0.0.0";
        StringBuilder s = new StringBuilder();
        s.append("(function () {\n");
        s.append("  if (window.top !== window || 'commsHubNative' in window) return;\n");
        s.append("  var call = function (method, options) {\n");
        s.append("    var cap = window.Capacitor;\n");
        s.append("    return cap && cap.nativePromise ? cap.nativePromise('CommsHubShell', method, options || {}) : Promise.reject(new Error('unavailable'));\n");
        s.append("  };\n");
        s.append("  var bridge = { platform: 'android', shell: 'capacitor', version: '").append(v).append("', bridge: ").append(BRIDGE).append(" };\n");
        if (appUpdate) {
            s.append("  bridge.appUpdate = Object.freeze({\n");
            s.append("    status: function () { return call('appUpdateStatus'); },\n");
            s.append("    start: function (r) { r = r || {}; return call('appUpdateStart', { version: String(r.version), file: String(r.file), size: Number(r.size), sha256: String(r.sha256) }).then(function (x) { return x.result; }); }\n");
            s.append("  });\n");
        }
        s.append("  Object.defineProperty(window, 'commsHubNative', { value: Object.freeze(bridge), writable: false, configurable: false, enumerable: false });\n");
        s.append("})();\n");
        return s.toString();
    }
}
