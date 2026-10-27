package sa.commshub.app;

import android.Manifest;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * The application's methods behind window.commsHubNative (Identity.java; src/lib/native/index.ts). Capacitor
 * hears a page only from its main frame; every method here also checks that the page in front is on the
 * compiled list, and checks its arguments. No method takes a place on the phone, a full address or a command: a
 * file of the site is named by its path on the page's own address, one of the site's file routes (SiteFiles).
 */
@CapacitorPlugin(name = "CommsHubShell", permissions = { @Permission(alias = "notices", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class CommsHubShell extends Plugin {

    /** The plugin of the window, for the push service and a tapped push, which arrive outside a call of the page. */
    private static volatile CommsHubShell current;

    @Override
    public void load() {
        current = this;
    }

    private boolean fromSite(PluginCall call) {
        if (Navigation.isAllowed(Shell.currentUrl(), Shell.ALLOWED)) return true;
        call.reject("refused");
        return false;
    }

    // --- appUpdate (A3) -----------------------------------------------------------------------------

    @PluginMethod
    public void appUpdateStatus(PluginCall call) {
        if (!fromSite(call)) return;
        if (!AppUpdate.offered()) {
            call.reject("unavailable");
            return;
        }
        call.resolve(AppUpdate.get(getContext()).status());
    }

    @PluginMethod
    public void appUpdateStart(PluginCall call) {
        if (!fromSite(call)) return;
        String version = call.getString("version");
        String file = call.getString("file");
        String sha = call.getString("sha256");
        Double size = call.getDouble("size");
        JSObject out = new JSObject();
        if (size == null || size != Math.floor(size)) {
            out.put("result", "refused");
        } else {
            out.put("result", AppUpdate.get(getContext()).start(getActivity(), version, file, size.longValue(), sha));
        }
        call.resolve(out);
    }

    // --- download and share (A4) --------------------------------------------------------------------

    private interface Start {
        void start(Downloads downloads, String address, String name, Downloads.Answer answer);
    }

    /**
     * A file route of the page's own site, named by its path, fetched by the application (Downloads.java). The
     * page hears back only `{ ok }`: never the file, its place on the phone or anything the server said.
     */
    private void siteFile(PluginCall call, Start how) {
        if (!fromSite(call)) return;
        String address = SiteFiles.address(Shell.currentUrl(), call.getString("path"), Shell.ALLOWED);
        String name = SiteFiles.name(call.getString("name"));
        if (address == null || !(getActivity() instanceof MainActivity)) {
            call.reject("refused");
            return;
        }
        how.start(((MainActivity) getActivity()).downloads(), address, name, (ok) -> {
            JSObject out = new JSObject();
            out.put("ok", ok);
            call.resolve(out);
        });
    }

    @PluginMethod
    public void downloadSave(PluginCall call) {
        siteFile(call, Downloads::save);
    }

    @PluginMethod
    public void downloadOpen(PluginCall call) {
        siteFile(call, Downloads::open);
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        siteFile(call, Downloads::share);
    }

    // --- push (A5) ----------------------------------------------------------------------------------------

    /**
     * Whether notices are allowed: granted, denied, or still to be asked. Android 13 and newer ask the person;
     * older ones allow them unless the person turned them off. Turned off in Android's settings is denied.
     */
    private String pushStateNow() {
        boolean on = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        if (Build.VERSION.SDK_INT < 33) return on ? "granted" : "denied";
        PermissionState p = getPermissionState("notices");
        if (p == PermissionState.GRANTED) return on ? "granted" : "denied";
        if (p == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private void answerState(PluginCall call) {
        JSObject out = new JSObject();
        out.put("state", pushStateNow());
        call.resolve(out);
    }

    @PluginMethod
    public void pushState(PluginCall call) {
        if (!fromSite(call)) return;
        answerState(call);
    }

    /** Android's own question, after the page has said why (src/components/native/phone-push.tsx). */
    @PluginMethod
    public void pushRequest(PluginCall call) {
        if (!fromSite(call)) return;
        if (Build.VERSION.SDK_INT < 33 || !"prompt".equals(pushStateNow())) {
            answerState(call);
            return;
        }
        requestPermissionForAlias("notices", call, "pushAnswered");
    }

    @PermissionCallback
    private void pushAnswered(PluginCall call) {
        answerState(call);
    }

    /** This phone's token, only once notices are allowed and only when this build was given a Firebase project. */
    @PluginMethod
    public void pushToken(PluginCall call) {
        if (!fromSite(call)) return;
        JSObject none = new JSObject();
        none.put("token", (String) null);
        if (!ShellApp.configured() || !"granted".equals(pushStateNow())) {
            call.resolve(none);
            return;
        }
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener((task) -> {
            if (!task.isSuccessful() || task.getResult() == null) {
                call.resolve(none);
                return;
            }
            JSObject out = new JSObject();
            out.put("token", task.getResult());
            call.resolve(out);
        });
    }

    /** A push arrived while the application is in front: the page reads its notices again. */
    static void received() {
        CommsHubShell p = current;
        if (p != null) p.notifyListeners("pushReceive", new JSObject());
    }

    /**
     * A tapped push: the page in front moves there when it listens, otherwise the window opens that page of the
     * site. `go` was checked as a page of the site (Push.goPath); the address is built on the application's own.
     */
    static boolean open(String go) {
        CommsHubShell p = current;
        String path = Push.goPath(go);
        if (p == null || path == null) return false;
        if (p.hasListeners("pushOpen")) {
            JSObject out = new JSObject();
            out.put("go", path);
            p.notifyListeners("pushOpen", out);
            return true;
        }
        String site = Navigation.originOf(Navigation.parse(p.getBridge().getServerUrl()));
        if (!Shell.ALLOWED.contains(site)) return false;
        p.getBridge().getWebView().post(() -> p.getBridge().getWebView().loadUrl(site + path));
        return true;
    }
}
