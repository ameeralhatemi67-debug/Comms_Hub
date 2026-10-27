package sa.commshub.app;

import java.util.regex.Pattern;

/**
 * Push notices (MVP_draft.md 64.3; Android_Build_Plan.md A5, the application's half): what a push may open, and
 * the channel it is shown in. The page a push opens is a path of the site's own pages, held equal to goPath of
 * src/lib/native/push.ts by tests/native.test.mjs (the same patterns, rule for rule). Pure.
 */
final class Push {

    /** The channels (Android keeps them by id): «يحتاج قرارك» with sound, «للانتباه» silent, «الرسائل» with sound. */
    static final String DECIDE = "decide";
    static final String ATTENTION = "attention";
    static final String MESSAGES = "messages";

    /** goPath's rules: a pattern the path must match (true) or must not (false). */
    static final String[][] GO_RULES = {
        { "^/[A-Za-z0-9._~/?=&%:+,;@!$'()*-]*$", "true" },
        { "^//", "false" },
        { "(^|/)[.][.]?(/|$|[?])", "false" },
        { "^/(api|_next|_capacitor_file_|_capacitor_content_|r|m)(/|$|[?])", "false" },
    };

    private static final Pattern[] COMPILED = compile();

    private Push() {}

    private static Pattern[] compile() {
        Pattern[] out = new Pattern[GO_RULES.length];
        for (int i = 0; i < GO_RULES.length; i++) out[i] = Pattern.compile(GO_RULES[i][0]);
        return out;
    }

    /** The page a push opens, or null for anything that is not a page of the site. */
    static String goPath(String go) {
        if (go == null || go.length() > 300) return null;
        // Java's `$` also matches before a final line break, which JavaScript's does not: no control character.
        for (int i = 0; i < go.length(); i++) if (go.charAt(i) < 0x20 || go.charAt(i) == 0x7f) return null;
        for (int i = 0; i < COMPILED.length; i++) {
            boolean must = Boolean.parseBoolean(GO_RULES[i][1]);
            if (COMPILED[i].matcher(go).find() != must) return null;
        }
        return go;
    }

    /**
     * The channel of a push: a message in «المراسلة» or the mail goes to «الرسائل»; a notice by its tier. Null for
     * anything never shown (`info`, an unknown kind or tier).
     */
    static String channelOf(String kind, String tier) {
        if ("chat".equals(kind) || "mail".equals(kind)) return MESSAGES;
        if (!"notice".equals(kind)) return null;
        if (DECIDE.equals(tier)) return DECIDE;
        if (ATTENTION.equals(tier)) return ATTENTION;
        return null;
    }

    /** A notice's text as shown: one line, without control characters, at most 300 characters. */
    static String text(String s) {
        if (s == null) return null;
        String t = s.replaceAll("[\\p{Cntrl}\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]", " ").replaceAll("\\s+", " ").trim();
        if (t.isEmpty()) return null;
        return t.codePointCount(0, t.length()) > 300 ? t.substring(0, t.offsetByCodePoints(0, 300)) : t;
    }
}
