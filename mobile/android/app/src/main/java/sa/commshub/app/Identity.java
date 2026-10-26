package sa.commshub.app;

import java.util.regex.Pattern;

/**
 * The application as the site sees it: `window.commsHubNative` (src/lib/native/index.ts; AGENTS.md, the
 * Android paragraph). The script runs at the start of every page of a compiled address, before the page's
 * own scripts, and defines the object in the top frame only, frozen and not replaceable. Bridge version 1
 * is the identity alone: platform, shell, version. The phases after A2 add the features. Pure.
 */
final class Identity {

    static final int BRIDGE = 1;
    private static final Pattern SEMVER = Pattern.compile("^\\d+\\.\\d+\\.\\d+$");

    private Identity() {}

    static String script(String version) {
        String v = version != null && SEMVER.matcher(version).matches() ? version : "0.0.0";
        return "(function () {\n"
            + "  if (window.top !== window || 'commsHubNative' in window) return;\n"
            + "  var bridge = Object.freeze({ platform: 'android', shell: 'capacitor', version: '" + v + "', bridge: " + BRIDGE + " });\n"
            + "  Object.defineProperty(window, 'commsHubNative', { value: bridge, writable: false, configurable: false, enumerable: false });\n"
            + "})();\n";
    }
}
