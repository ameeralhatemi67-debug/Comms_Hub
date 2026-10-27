package sa.commshub.app;

import java.util.regex.Pattern;

/**
 * The application as the site sees it: `window.commsHubNative` (src/lib/native/index.ts; AGENTS.md, the
 * Android paragraph). The script runs at the start of every page of a compiled address, before the page's
 * own scripts, and defines the object in the top frame only, frozen and not replaceable.
 *
 * Bridge version 1 (A2) was the identity alone. Version 2 (A3) adds `appUpdate` in the APK channel. Version 3
 * (A4) adds `download` (save, open) and `share` (file), each naming a file of the site by its path. Version 4
 * (A5) adds `push` (state, request, token, onOpen, onReceive). Version 5 (A6) adds `links` (verified) and `lock`
 * (state, set). Version 6 (A7) adds `capture` (take), `incoming` (take) and `upload` (start, status, cancel). Each method calls the application's plugin
 * (CommsHubShell) through Capacitor, which hears only the main frame, and passes only the plain values the plugin
 * checks. Pure.
 */
final class Identity {

    static final int BRIDGE = 6;
    private static final Pattern SEMVER = Pattern.compile("^\\d+\\.\\d+\\.\\d+$");

    private Identity() {}

    static String script(String version, boolean appUpdate) {
        String v = version != null && SEMVER.matcher(version).matches() ? version : "0.0.0";
        StringBuilder s = new StringBuilder();
        s.append("(function () {\n");
        s.append("  if (window.top !== window || 'commsHubNative' in window) return;\n");
        s.append("  var call = function (method, options) {\n");
        s.append("    var cap = window.Capacitor;\n");
        s.append("    return cap && cap.nativePromise ? cap.nativePromise('CommsHubShell', method, options || {}) : Promise.reject(new Error('unavailable'));\n");
        s.append("  };\n");
        s.append("  var bridge = { platform: 'android', shell: 'capacitor', version: '").append(v).append("', bridge: ").append(BRIDGE).append(" };\n");
        if (appUpdate) {
            s.append("  bridge.appUpdate = Object.freeze({\n");
            s.append("    status: function () { return call('appUpdateStatus'); },\n");
            s.append("    start: function (r) { r = r || {}; return call('appUpdateStart', { version: String(r.version), file: String(r.file), size: Number(r.size), sha256: String(r.sha256) }).then(function (x) { return x.result; }); }\n");
            s.append("  });\n");
        }
        s.append("  var file = function (method) { return function (f) { f = f || {}; return call(method, { path: String(f.path), name: String(f.name) }).then(function (x) { return x.ok === true; }); }; };\n");
        s.append("  bridge.download = Object.freeze({ save: file('downloadSave'), open: file('downloadOpen') });\n");
        s.append("  bridge.share = Object.freeze({ file: file('shareFile') });\n");
        // One listener per event; giving another function replaces it, giving none removes it.
        s.append("  var listen = function (event, give) { var held = null; return function (fn) { var cap = window.Capacitor; if (held) { held.remove(); held = null; } if (typeof fn === 'function' && cap && cap.addListener) held = cap.addListener('CommsHubShell', event, function (x) { give(fn, x || {}); }); }; };\n");
        s.append("  var state = function (method) { return function () { return call(method).then(function (x) { return x.state; }); }; };\n");
        s.append("  bridge.push = Object.freeze({\n");
        s.append("    state: state('pushState'),\n");
        s.append("    request: state('pushRequest'),\n");
        s.append("    token: function () { return call('pushToken').then(function (x) { return typeof x.token === 'string' ? x.token : null; }); },\n");
        s.append("    onOpen: listen('pushOpen', function (fn, x) { if (typeof x.go === 'string') fn(x.go); }),\n");
        s.append("    onReceive: listen('pushReceive', function (fn) { fn(); })\n");
        s.append("  });\n");
        s.append("  bridge.links = Object.freeze({ verified: function () { return call('linksVerified').then(function (x) { return x.verified === true; }); } });\n");
        s.append("  bridge.lock = Object.freeze({\n");
        s.append("    state: function () { return call('lockState').then(function (x) { return { available: x.available === true, on: x.on === true }; }); },\n");
        s.append("    set: function (on) { return call('lockSet', { on: on === true }).then(function (x) { return x.ok === true; }); }\n");
        s.append("  });\n");
        s.append("  var held = function (x) { return x && typeof x.token === 'string' ? { token: x.token, name: x.name, size: x.size, type: x.type } : null; };\n");
        s.append("  bridge.capture = Object.freeze({ take: function (kind) { return call('captureTake', { kind: kind === 'video' ? 'video' : 'photo' }).then(held); } });\n");
        s.append("  bridge.incoming = Object.freeze({ take: function () { return call('incomingTake').then(function (x) { return Array.isArray(x.files) ? x.files.map(held) : []; }); } });\n");
        s.append("  bridge.upload = Object.freeze({\n");
        s.append("    start: function (a) { a = a || {}; return call('uploadStart', { token: String(a.token), session: String(a.session) }).then(function (x) { return typeof x.id === 'string' ? x.id : null; }); },\n");
        s.append("    status: function () { return call('uploadStatus').then(function (x) { return Array.isArray(x.uploads) ? x.uploads : []; }); },\n");
        s.append("    cancel: function (id) { return call('uploadCancel', { id: String(id) }).then(function (x) { return x.ok === true; }); }\n");
        s.append("  });\n");
        s.append("  Object.defineProperty(window, 'commsHubNative', { value: Object.freeze(bridge), writable: false, configurable: false, enumerable: false });\n");
        s.append("})();\n");
        return s.toString();
    }
}
