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
        assertTrue(s.contains("platform: 'android', shell: 'capacitor', version: '0.1.0', bridge: 4"));
        assertTrue(s.contains("value: Object.freeze(bridge), writable: false, configurable: false"));
        assertFalse(s.contains("appUpdate"));
    }

    @Test
    public void filesAreNamedByPathAndNameOnlyAndAnswerTrueOrFalse() {
        String s = Identity.script("0.1.0", false);
        assertTrue(s.contains("call(method, { path: String(f.path), name: String(f.name) }).then(function (x) { return x.ok === true; })"));
        assertTrue(s.contains("bridge.download = Object.freeze({ save: file('downloadSave'), open: file('downloadOpen') });"));
        assertTrue(s.contains("bridge.share = Object.freeze({ file: file('shareFile') });"));
    }

    @Test
    public void pushAnswersPlainValuesAndListensThroughCapacitorOnly() {
        String s = Identity.script("0.1.0", false);
        assertTrue(s.contains("state: state('pushState'),"));
        assertTrue(s.contains("request: state('pushRequest'),"));
        assertTrue(s.contains("token: function () { return call('pushToken').then(function (x) { return typeof x.token === 'string' ? x.token : null; }); },"));
        assertTrue(s.contains("onOpen: listen('pushOpen', function (fn, x) { if (typeof x.go === 'string') fn(x.go); }),"));
        assertTrue(s.contains("onReceive: listen('pushReceive', function (fn) { fn(); })"));
        assertTrue(s.contains("held = cap.addListener('CommsHubShell', event,"));
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
        assertTrue(Identity.script(null, true).contains("version: '0.0.0'"));
        assertFalse(Identity.script(null, true).contains("version: 'null'"));
    }
}
