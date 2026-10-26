package sa.commshub.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** What a release asked for by the page must be before the application fetches it (Releases). */
public class ReleasesTest {

    private static final String SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Test
    public void theVersionNumberAsTheBuildMakesIt() {
        assertEquals(100, Releases.codeOf("0.1.0"));
        assertEquals(10203, Releases.codeOf("1.2.3"));
        assertEquals(-1, Releases.codeOf("1.2"));
        assertEquals(-1, Releases.codeOf("1.100.0"));
        assertEquals(-1, Releases.codeOf(null));
        assertTrue(Releases.newer("0.1.1", "0.1.0"));
        assertTrue(Releases.newer("0.10.0", "0.9.9"));
        assertFalse(Releases.newer("0.1.0", "0.1.0"));
        assertFalse(Releases.newer("0.0.9", "0.1.0"));
    }

    @Test
    public void onlyAPlainApkOfAStatedSizeWithItsDigest() {
        assertTrue(Releases.acceptable("0.1.1", "CommsHub-0.1.1.apk", 9_000_000, SHA, "0.1.0"));
        assertFalse(Releases.acceptable("0.1.1", "../CommsHub.apk", 9_000_000, SHA, "0.1.0"));
        assertFalse(Releases.acceptable("0.1.1", "https://x.example/a.apk", 9_000_000, SHA, "0.1.0"));
        assertFalse(Releases.acceptable("0.1.1", ".apk", 9_000_000, SHA, "0.1.0"));
        assertFalse(Releases.acceptable("0.1.1", "CommsHub.exe", 9_000_000, SHA, "0.1.0"));
        assertFalse(Releases.acceptable("0.1.1", "CommsHub.apk", 0, SHA, "0.1.0"));
        assertFalse(Releases.acceptable("0.1.1", "CommsHub.apk", 400_000_000, SHA, "0.1.0"));
        assertFalse(Releases.acceptable("0.1.1", "CommsHub.apk", 9_000_000, SHA.toUpperCase(), "0.1.0"));
        assertFalse(Releases.acceptable("0.1.0", "CommsHub.apk", 9_000_000, SHA, "0.1.0"));
        assertFalse(Releases.acceptable("latest", "CommsHub.apk", 9_000_000, SHA, "0.1.0"));
    }
}
