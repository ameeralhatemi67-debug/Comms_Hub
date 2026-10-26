package sa.commshub.app;

import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Where an address goes (MVP_draft.md 64; Android_Build_Plan.md A2). The desktop's rules
 * (desktop/src/origins.ts and navigation.ts) ported; mobile/tests hold the routes and the note equal.
 *
 * On the compiled list an address stays in the application, except the pages meant for outside people
 * (a review link, an answer page), which open in the browser as they do for the people they are for. The
 * outside-connection routes open in the browser after a note: Google refuses sign-in inside an
 * application, and the connection's state cookie must sit in the same browser as its callback. Other web
 * addresses open in the browser, mail links in the mail application, and any other kind of address is
 * refused. Pure: no Android class, so the JVM tests run it as it is.
 */
final class Navigation {

    enum Action { STAY, BROWSER, NOTE_THEN_BROWSER, MAIL, REFUSE }

    static final List<String> CONNECT_ROUTES = Collections.unmodifiableList(Arrays.asList("/api/drive/connect", "/api/onedrive/connect"));
    static final String PLATFORM_CONNECT = "/api/platforms/connect/";
    /** Pages for people without an account: review links and answers to our mail. */
    static final List<String> OUTSIDE_PAGES = Collections.unmodifiableList(Arrays.asList("/r/", "/m/"));

    private Navigation() {}

    /** The origin of an address as a browser writes it: scheme, host and a port only when it is not the scheme's own. */
    static String originOf(URI uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        int port = uri.getPort();
        boolean usual = port == -1 || ("https".equals(scheme) && port == 443) || ("http".equals(scheme) && port == 80);
        return scheme + "://" + host + (usual ? "" : ":" + port);
    }

    static URI parse(String address) {
        if (address == null) return null;
        try {
            return new URI(address);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Whether an address is on the list: http or https, its exact origin listed, and no name or password
     * written into it. `https://comms-hub-three.vercel.app.example.com` is another origin, so it is not.
     */
    static boolean isAllowed(String address, List<String> allowed) {
        URI uri = parse(address);
        if (uri == null || uri.getHost() == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("https") && !scheme.equals("http")) return false;
        if (uri.getRawUserInfo() != null) return false;
        return allowed.contains(originOf(uri));
    }

    /** The site's outside-connection routes: Drive, OneDrive and every platform's connection. */
    static boolean isConnectRoute(String path) {
        if (path == null) return false;
        String p = path.replaceAll("/+$", "");
        return CONNECT_ROUTES.contains(p) || (p.startsWith(PLATFORM_CONNECT) && p.length() > PLATFORM_CONNECT.length());
    }

    static boolean isOutsidePage(String path) {
        if (path == null) return false;
        for (String prefix : OUTSIDE_PAGES) if (path.startsWith(prefix)) return true;
        return false;
    }

    /** One rule for a link, a form, a redirect and a page opened in a new window alike. */
    static Action decide(String address, List<String> allowed) {
        URI uri = parse(address);
        if (uri == null || uri.getScheme() == null) return Action.REFUSE;
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if (scheme.equals("https") || scheme.equals("http")) {
            if (uri.getHost() == null) return Action.REFUSE;
            if (!isAllowed(address, allowed)) return uri.getRawUserInfo() != null ? Action.REFUSE : Action.BROWSER;
            String path = uri.getRawPath();
            if (isConnectRoute(path)) return Action.NOTE_THEN_BROWSER;
            if (isOutsidePage(path)) return Action.BROWSER;
            return Action.STAY;
        }
        if (scheme.equals("mailto")) return Action.MAIL;
        return Action.REFUSE;
    }
}
