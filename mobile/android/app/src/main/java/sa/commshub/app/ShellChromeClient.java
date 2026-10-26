package sa.commshub.app;

import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.Arrays;
import java.util.List;

/**
 * Capacitor's chrome client, keeping its file chooser and its permission requests, with the permissions
 * narrowed to the specification (MVP_draft.md 64): the microphone alone, for voice notes in «المراسلة», and
 * only to a page of a compiled address. Android asks the person the first time. Everything else a page may
 * ask (the camera through the page, location, MIDI, protected media) is refused; the camera comes later
 * through the application's own capture (A7).
 */
final class ShellChromeClient extends BridgeWebChromeClient {

    static final String MICROPHONE = PermissionRequest.RESOURCE_AUDIO_CAPTURE;

    ShellChromeClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public void onPermissionRequest(PermissionRequest request) {
        List<String> asked = Arrays.asList(request.getResources());
        boolean onList = request.getOrigin() != null && Navigation.isAllowed(request.getOrigin().toString(), Shell.ALLOWED);
        if (onList && asked.size() == 1 && asked.contains(MICROPHONE)) {
            super.onPermissionRequest(request);
        } else {
            request.deny();
        }
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        callback.invoke(origin, false, false);
    }
}
