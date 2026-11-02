package sa.commshub.app;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The site's files the application saves, opens or shares for the page (MVP_draft.md 64.2; Android_Build_Plan.md
 * A4). The page names a file by its path on its own address, one of the site's file routes, and never by a full
 * address: the application builds the address on the origin of the page in front, so a page can only ever ask
 * for its own site's files, which the site still decides who may read. The routes are held equal to
 * src/lib/native/files.ts by tests/native.test.mjs. Pure.
 */
final class SiteFiles {

    private static final String ID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    /** The site's file routes, as a page may name them: a library file (a version, a download), messaging, mail, a written work. */
    static final String[] ROUTES = {
        "^/api/media/" + ID + "/content(\\?(v=[1-9][0-9]{0,5}(&download=1)?|download=1))?$",
        "^/api/chat/file/" + ID + "$",
        "^/api/mail/file/" + ID + "$",
        "^/api/mail/inbound/" + ID + "/[0-9]{1,2}$",
        "^/api/writing/CH-[0-9]{1,6}/file\\?kind=(docx|pdf|txt)$",
        "^/api/writing/CH-[0-9]{1,6}/image/" + ID + "$",
    };

    private static final Pattern[] COMPILED = compile();

    /** Above this size, sharing asks first, saying the size (MVP_draft.md 64.2). */
    static final long ASK_TO_SHARE = 50L * 1024 * 1024;

    private SiteFiles() {}

    private static Pattern[] compile() {
        Pattern[] out = new Pattern[ROUTES.length];
        for (int i = 0; i < ROUTES.length; i++) out[i] = Pattern.compile(ROUTES[i]);
        return out;
    }

    /** The path when it is one of the site's file routes, else null. */
    static String path(String path) {
        if (path == null || path.length() > 200) return null;
        for (Pattern p : COMPILED) if (p.matcher(path).matches()) return path;
        return null;
    }

    /**
     * The address of a file on the page's own origin, or null when the page is not on the compiled list or the
     * path is not a file route.
     */
    static String address(String pageUrl, String path, java.util.List<String> allowed) {
        String p = path(path);
        if (p == null || !Navigation.isAllowed(pageUrl, allowed)) return null;
        return Navigation.originOf(Navigation.parse(pageUrl)) + p;
    }

    /** The name the page gives a file: short plain text, kept only as the last name to fall back on. */
    static String name(String name) {
        if (name == null || name.length() > 400) return null;
        return FileNames.safe(name);
    }

    /** Where a saved file goes: photos and videos to the gallery, everything else to Downloads. */
    enum Place { IMAGES, VIDEOS, DOWNLOADS }

    static Place placeOf(String type) {
        String t = type == null ? "" : type.toLowerCase(Locale.ROOT);
        if (t.startsWith("image/")) return Place.IMAGES;
        if (t.startsWith("video/")) return Place.VIDEOS;
        return Place.DOWNLOADS;
    }

    /** A size in Arabic words for the question before a large share: «… ميغابايت» or «… غيغابايت». */
    static String size(long bytes) {
        if (bytes >= 1024L * 1024 * 1024) return String.format(Locale.ROOT, "%.1f غيغابايت", bytes / (1024.0 * 1024 * 1024));
        return String.format(Locale.ROOT, "%d ميغابايت", Math.max(1, Math.round(bytes / (1024.0 * 1024))));
    }
}
