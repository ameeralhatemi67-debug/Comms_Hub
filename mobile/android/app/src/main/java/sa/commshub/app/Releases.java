package sa.commshub.app;

import java.util.regex.Pattern;

/**
 * What a release asked for by the page must be before the application fetches it (Android_Build_Plan.md
 * A3). The page names a release from latest.json; the application builds the address itself from its
 * compiled feed, and fetches only a plain `.apk` name, of a stated size, with a SHA-256, newer than itself.
 * The same shapes as parseAndroidLatest in src/lib/native/releases.ts. Pure.
 */
final class Releases {

    static final long MAX_SIZE = 300_000_000L;
    private static final Pattern FILE = Pattern.compile("^[\\w.-]+\\.apk$");
    private static final Pattern SHA = Pattern.compile("^[0-9a-f]{64}$");
    private static final Pattern SEMVER = Pattern.compile("^(\\d+)\\.(\\d+)\\.(\\d+)$");

    private Releases() {}

    static boolean validFile(String file) {
        return file != null && FILE.matcher(file).matches() && !file.startsWith(".");
    }

    static boolean validSha(String sha) {
        return sha != null && SHA.matcher(sha).matches();
    }

    static boolean validSize(long size) {
        return size > 0 && size <= MAX_SIZE;
    }

    /** Android's whole number for a version, as android/app/build.gradle makes it; -1 for anything else. */
    static long codeOf(String version) {
        if (version == null) return -1;
        java.util.regex.Matcher m = SEMVER.matcher(version);
        if (!m.matches()) return -1;
        long major = Long.parseLong(m.group(1));
        long minor = Long.parseLong(m.group(2));
        long patch = Long.parseLong(m.group(3));
        if (minor > 99 || patch > 99) return -1;
        return major * 10000 + minor * 100 + patch;
    }

    static boolean newer(String candidate, String current) {
        long a = codeOf(candidate);
        long b = codeOf(current);
        return a > 0 && b >= 0 && a > b;
    }

    /** Every condition at once, as the start of an update checks it. */
    static boolean acceptable(String version, String file, long size, String sha, String current) {
        return validFile(file) && validSha(sha) && validSize(size) && newer(version, current);
    }
}
