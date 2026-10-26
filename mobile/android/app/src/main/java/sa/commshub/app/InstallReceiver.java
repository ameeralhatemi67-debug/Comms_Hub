package sa.commshub.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Android's answer to an update's installation session (AppUpdate): its confirmation to show, or how it ended. */
public class InstallReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!AppUpdate.INSTALLED.equals(intent.getAction())) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        AppUpdate.get(context).installStatus(status, confirmOf(intent));
    }

    @SuppressWarnings("deprecation")
    private static Intent confirmOf(Intent intent) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) return intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
        return intent.getParcelableExtra(Intent.EXTRA_INTENT);
    }
}
