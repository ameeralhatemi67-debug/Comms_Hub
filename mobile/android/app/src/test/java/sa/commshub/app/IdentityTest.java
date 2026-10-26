package sa.commshub.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The identity script the site reads as window.commsHubNative (src/lib/native/index.ts, readBridge). */
public class IdentityTest {

    @Test
    public void topFrameOnlyFrozenAndTheShapeTheSiteReads() {
        String s = Identity.script("0.1.0", false);
        assertTrue(s.contains("if (window.top !== window || 'commsHubNative' in window) return;"));
        assertTrue(s.contains("platform: 'android', shell: 'capacitor', version: '0.1.0', bridge: 2"));
        assertTrue(s.contains("value: Object.freeze(bridge), writable: false, configurable: false"));
        assertFalse(s.contains("appUpdate"));
    }

    @Test
    public void theApkChannelOffersItsUpdateThroughThePluginOnly() {
        String s = Identity.script("0.1.0", true);
        assertTrue(s.contains("bridge.appUpdate = Object.freeze({"));
        assertTrue(s.contains("status: function () { return call('appUpdateStatus'); }"));
        assertTrue(s.contains("call('appUpdateStart', { version: String(r.version), file: String(r.file), size: Number(r.size), sha256: String(r.sha256) })"));
        assertTrue(s.contains("cap.nativePromise('CommsHubShell', method, options || {})"));
    }

    @Test
    public void aVersionIsOnlyEverThreeNumbers() {
        assertTrue(Identity.script("1.2.3-rc'); alert(1); ('", false).contains("version: '0.0.0'"));
        assertFalse(Identity.script(null, true).contains("null"));
    }
}
