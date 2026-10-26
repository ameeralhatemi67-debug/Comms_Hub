package sa.commshub.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The application's methods behind window.commsHubNative (Identity.java; src/lib/native/index.ts). Capacitor
 * hears a page only from its main frame; every method here also checks that the page in front is on the
 * compiled list, and checks its arguments. No method takes a path, an address or a command.
 */
@CapacitorPlugin(name = "CommsHubShell")
public class CommsHubShell extends Plugin {

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
}
