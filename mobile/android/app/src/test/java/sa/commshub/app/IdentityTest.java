package sa.commshub.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The identity script the site reads as window.commsHubNative (src/lib/native/index.ts, readBridge). */
public class IdentityTest {

    @Test
    public void topFrameOnlyFrozenAndTheShapeTheSiteReads() {
        String s = Identity.script("0.1.0");
        assertTrue(s.contains("if (window.top !== window || 'commsHubNative' in window) return;"));
        assertTrue(s.contains("platform: 'android', shell: 'capacitor', version: '0.1.0', bridge: 1"));
        assertTrue(s.contains("Object.freeze("));
        assertTrue(s.contains("writable: false, configurable: false"));
    }

    @Test
    public void aVersionIsOnlyEverThreeNumbers() {
        assertTrue(Identity.script("1.2.3-rc'); alert(1); ('").contains("version: '0.0.0'"));
        assertFalse(Identity.script(null).contains("null"));
    }
}
