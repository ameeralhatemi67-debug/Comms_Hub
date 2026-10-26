package sa.commshub.app;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The name a downloaded file is saved under (MVP_draft.md 64, «التنزيلات»). The site names its files in
 * Content-Disposition, Arabic names as `filename*=UTF-8''…` (RFC 5987) with a plain `filename` beside it.
 * The name is kept as the site wrote it, without anything that would make it a path. Pure.
 */
final class FileNames {

    static final int MAX = 120;
    private static final Pattern STAR = Pattern.compile("filename\\*\\s*=\\s*([^;]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern PLAIN = Pattern.compile("filename\\s*=\\s*(\"((?:[^\"\\\\]|\\\\.)*)\"|[^;\\s]+)", Pattern.CASE_INSENSITIVE);

    private FileNames() {}

    /** The name in a Content-Disposition header, safe to save under, or null when it names none. */
    static String fromDisposition(String disposition) {
        if (disposition == null) return null;
        Matcher star = STAR.matcher(disposition);
        if (star.find()) {
            String value = star.group(1).trim();
            int quote = value.indexOf("''");
            if (quote >= 0) {
                String charset = value.substring(0, quote).trim();
                String encoded = value.substring(quote + 2).trim();
                if (charset.equalsIgnoreCase("UTF-8")) {
                    try {
                        String name = safe(URLDecoder.decode(encoded.replace("+", "%2B"), StandardCharsets.UTF_8.name()));
                        if (name != null) return name;
                    } catch (Exception ignored) {
                        // a broken encoding: the plain name below
                    }
                }
            }
        }
        Matcher plain = PLAIN.matcher(disposition.replaceAll("(?i)filename\\*\\s*=\\s*[^;]+;?", ""));
        if (plain.find()) {
            String value = plain.group(2) != null ? plain.group(2).replaceAll("\\\\(.)", "$1") : plain.group(1);
            return safe(value);
        }
        return null;
    }

    /**
     * The last part of an address's path when it names a file (it has a kind after a dot), else null. The
     * web view does not pass a link's own `download` name, so a file the site serves without a name in
     * its headers is saved under the name in its address.
     */
    static String fromUrl(String address) {
        if (address == null) return null;
        try {
            String path = new java.net.URI(address).getRawPath();
            if (path == null) return null;
            String last = path.substring(path.lastIndexOf('/') + 1);
            String name = URLDecoder.decode(last.replace("+", "%2B"), StandardCharsets.UTF_8.name());
            int dot = name.lastIndexOf('.');
            return dot > 0 && dot < name.length() - 1 ? safe(name) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** A name without folders, control characters or characters a file system refuses; null when nothing is left. */
    static String safe(String name) {
        if (name == null) return null;
        String n = name.replaceAll("[\\p{Cntrl}\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]", "");
        int slash = Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\'));
        if (slash >= 0) n = n.substring(slash + 1);
        n = n.replaceAll("[:*?\"<>|]", "_").trim();
        while (n.startsWith(".")) n = n.substring(1).trim();
        if (n.isEmpty()) return null;
        if (n.codePointCount(0, n.length()) > MAX) {
            int dot = n.lastIndexOf('.');
            String ext = dot > 0 && n.length() - dot <= 10 ? n.substring(dot) : "";
            String stem = ext.isEmpty() ? n : n.substring(0, dot);
            int keep = MAX - ext.length();
            stem = stem.substring(0, stem.offsetByCodePoints(0, Math.min(keep, stem.codePointCount(0, stem.length()))));
            n = stem + ext;
        }
        return n;
    }
}
