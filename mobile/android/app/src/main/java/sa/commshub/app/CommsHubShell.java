package sa.commshub.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The application's methods behind window.commsHubNative (Identity.java; src/lib/native/index.ts). Capacitor
 * hears a page only from its main frame; every method here also checks that the page in front is on the
 * compiled list, and checks its arguments. No method takes a place on the phone, a full address or a command: a
 * file of the site is named by its path on the page's own address, one of the site's file routes (SiteFiles).
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
}
