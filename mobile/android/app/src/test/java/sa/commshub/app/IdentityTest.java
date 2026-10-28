package sa.commshub.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The identity script the site reads as window.commsHubNative (src/lib/native/index.ts, readBridge). */
public class IdentityTest {

    @Test
    public void topFrameOnlyFrozenAndTheShapeTheSiteReads() {
        String s = Identity.script("0.1.0", false, false);
        assertTrue(s.contains("if (window.top !== window || 'commsHubNative' in window) return;"));
        assertTrue(s.contains("platform: 'android', shell: 'capacitor', version: '0.1.0', bridge: 7"));
        assertTrue(s.contains("value: Object.freeze(bridge), writable: false, configurable: false"));
        assertFalse(s.contains("appUpdate"));
    }

    @Test
    public void filesAreNamedByPathAndNameOnlyAndAnswerTrueOrFalse() {
        String s = Identity.script("0.1.0", false, false);
        assertTrue(s.contains("call(method, { path: String(f.path), name: String(f.name) }).then(function (x) { return x.ok === true; })"));
        assertTrue(s.contains("bridge.download = Object.freeze({ save: file('downloadSave'), open: file('downloadOpen') });"));
        assertTrue(s.contains("bridge.share = Object.freeze({ file: file('shareFile') });"));
    }

    @Test
    public void pushAnswersPlainValuesAndListensThroughCapacitorOnly() {
        String s = Identity.script("0.1.0", false, false);
        assertTrue(s.contains("state: state('pushState'),"));
        assertTrue(s.contains("request: state('pushRequest'),"));
        assertTrue(s.contains("token: function () { return call('pushToken').then(function (x) { return typeof x.token === 'string' ? x.token : null; }); },"));
        assertTrue(s.contains("onOpen: listen('pushOpen', function (fn, x) { if (typeof x.go === 'string') fn(x.go); }),"));
        assertTrue(s.contains("onReceive: listen('pushReceive', function (fn) { fn(); })"));
        assertTrue(s.contains("held = cap.addListener('CommsHubShell', event,"));
    }

    @Test
    public void heldFilesAreTokensAndAnUploadIsATokenAndASession() {
        String s = Identity.script("0.1.0", false, false);
        assertTrue(s.contains("var held = function (x) { return x && typeof x.token === 'string' ? { token: x.token, name: x.name, size: x.size, type: x.type } : null; };"));
        assertTrue(s.contains("call('captureTake', { kind: kind === 'video' ? 'video' : 'photo' }).then(held)"));
        assertTrue(s.contains("call('incomingTake').then(function (x) { return Array.isArray(x.files) ? x.files.map(held) : []; })"));
        assertTrue(s.contains("call('uploadStart', { token: String(a.token), session: String(a.session) })"));
        assertTrue(s.contains("call('uploadCancel', { id: String(id) })"));
    }

    @Test
    public void linksAndTheLockAnswerPlainBooleans() {
        String s = Identity.script("0.1.0", false, false);
        assertTrue(s.contains("bridge.links = Object.freeze({ verified: function () { return call('linksVerified').then(function (x) { return x.verified === true; }); } });"));
        assertTrue(s.contains("state: function () { return call('lockState').then(function (x) { return { available: x.available === true, on: x.on === true }; }); },"));
        assertTrue(s.contains("set: function (on) { return call('lockSet', { on: on === true }).then(function (x) { return x.ok === true; }); }"));
    }

    @Test
    public void theApkChannelOffersItsUpdateThroughThePluginOnly() {
        String s = Identity.script("0.1.0", true, false);
        assertTrue(s.contains("bridge.appUpdate = Object.freeze({"));
        assertTrue(s.contains("status: function () { return call('appUpdateStatus'); }"));
        assertTrue(s.contains("call('appUpdateStart', { version: String(r.version), file: String(r.file), size: Number(r.size), sha256: String(r.sha256) })"));
        assertTrue(s.contains("cap.nativePromise('CommsHubShell', method, options || {})"));
    }

    @Test
    public void googlePlaysCopyOffersPlaysUpdateAndNotItsOwn() {
        String s = Identity.script("0.1.0", false, true);
        assertFalse(s.contains("appUpdate"));
        assertTrue(s.contains("bridge.playUpdate = Object.freeze({"));
        assertTrue(s.contains("status: function () { return call('playUpdateStatus'); },"));
        assertTrue(s.contains("call('playUpdateStart', { mode: mode === 'immediate' ? 'immediate' : 'flexible' }).then(function (x) { return x.result; })"));
        assertTrue(s.contains("complete: function () { return call('playUpdateComplete').then(function (x) { return x.result; }); }"));
        assertFalse(Identity.script("0.1.0", true, false).contains("playUpdate"));
    }

    @Test
    public void aVersionIsOnlyEverThreeNumbers() {
        assertTrue(Identity.script("1.2.3-rc'); alert(1); ('", false, false).contains("version: '0.0.0'"));
        assertTrue(Identity.script(null, true, false).contains("version: '0.0.0'"));
        assertFalse(Identity.script(null, true, false).contains("version: 'null'"));
    }
}
