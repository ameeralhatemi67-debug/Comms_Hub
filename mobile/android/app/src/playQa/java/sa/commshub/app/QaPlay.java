package sa.commshub.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.google.android.play.core.appupdate.testing.FakeAppUpdateManager;
import org.json.JSONObject;

/**
 * Google Play's copy of the check package only (src/playQa; qa/android-play.cjs): the check plays Google Play
 * through Play's own FakeAppUpdateManager, which PlayUpdate asks in this build, and reads back what Play would be
 * showing. Each step is one of the stand-in's own methods; the answer is the stand-in's windows as the broadcast's
 * result. No release, development build or APK-channel build has this receiver.
 */
public class QaPlay extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        PlayUpdate update = PlayUpdate.get(context);
        FakeAppUpdateManager play = update.standIn();
        if (play == null) return;
        String step = intent.getStringExtra("step");
        if (step == null) step = "";
        switch (step) {
            case "available":
                play.setUpdateAvailable(intent.getIntExtra("code", 0));
                play.setUpdatePriority(intent.getIntExtra("priority", 0));
                break;
            case "none":
                play.setUpdateNotAvailable();
                break;
            case "accept":
                play.userAcceptsUpdate();
                break;
            case "reject":
                play.userRejectsUpdate();
                break;
            case "download":
                play.downloadStarts();
                play.setTotalBytesToDownload(intent.getLongExtra("total", 0));
                break;
            case "progress":
                play.setBytesDownloaded(intent.getLongExtra("done", 0));
                break;
            case "downloaded":
                play.downloadCompletes();
                break;
            case "installed":
                play.installCompletes();
                break;
            case "fails":
                play.downloadFails();
                break;
            default:
                break;
        }
        update.refresh(null);
        try {
            JSONObject out = new JSONObject();
            out.put("confirmation", play.isConfirmationDialogVisible());
            out.put("immediate", play.isImmediateFlowVisible());
            out.put("splash", play.isInstallSplashScreenVisible());
            Integer type = play.getTypeForUpdateInProgress();
            out.put("type", type != null ? type : -1);
            setResultData(out.toString());
        } catch (Exception ignored) {
            // the check reads nothing and fails its step
        }
    }
}
