package sa.commshub.app;

import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Links that open the application (MVP_draft.md 64.4; Android_Build_Plan.md A6). Android hands the application
 * an address of the site only for the paths its manifest claims, after it has verified the site's
 * `/.well-known/assetlinks.json`; the application checks the address again before opening it. The claimed paths
 * are the site's pages (src/lib/access.ts, menuEntries, without the root), the WhatsApp links for members (`/w/`)
 * and the return of a mailed sign-in link (`/app/return`); pages for outside people (`/r/`, `/m/`), the API and the
 * root stay with the browser. Held equal to the manifest and to the page list by mobile/tests. Pure.
 */
final class Links {

    static final List<String> PREFIXES = Collections.unmodifiableList(Arrays.asList(
        "/work", "/create", "/approvals", "/calendar", "/projects", "/requests", "/media", "/tasks", "/activity",
        "/analytics", "/motion", "/mail", "/channels", "/ideas", "/accounts", "/settings", "/w/", "/app/return"
    ));

    /** A dot segment, written plainly or percent-encoded as browsers read it: it could climb out of a claimed page. */
    private static final java.util.regex.Pattern DOTS = java.util.regex.Pattern.compile("(^|/)(\\.|%2[eE]){1,2}(/|$)");

    private Links() {}

    /**
     * Where a link opens: the same path and query on the address this build opens (the production address in a
     * release; the local site in a development or check build), or null when it is not one of the claimed links.
     */
    static String target(String link, String production, String opens) {
        URI uri = Navigation.parse(link);
        if (uri == null || uri.getHost() == null || uri.getRawUserInfo() != null) return null;
        if (!"https".equalsIgnoreCase(uri.getScheme())) return null;
        if (!production.equals(Navigation.originOf(uri))) return null;
        String path = uri.getRawPath();
        if (path == null || DOTS.matcher(path).find() || path.indexOf('\\') >= 0 || !claimed(path)) return null;
        String query = uri.getRawQuery();
        return opens + path + (query != null ? "?" + query : "");
    }

    /**
     * Whether a path is one of the claimed ones: under a prefix ending in a slash, or a page itself and what is
     * under it. Exactly what the manifest claims (`path` and `pathPrefix` "page/"), so Android never hands the
     * application an address it would then send to the browser, which would hand it back.
     */
    static boolean claimed(String path) {
        for (String p : PREFIXES) {
            if (p.endsWith("/") ? path.startsWith(p) : path.equals(p) || path.startsWith(p + "/")) return true;
        }
        return false;
    }
}
