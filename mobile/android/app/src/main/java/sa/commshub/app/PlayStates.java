package sa.commshub.app;

/**
 * Google Play's numbers for an update (A8, MVP_draft.md 64.6), in the words the page reads
 * (src/lib/native/play-update.ts). Play's own constants are numbers of its library (UpdateAvailability,
 * InstallStatus, the flow's result code); they are written here as numbers so the rules are tested on the JVM
 * for both channels, and PlayUpdate in Google Play's copy is the only caller. Pure.
 */
final class PlayStates {

    // UpdateAvailability
    static final int NOT_AVAILABLE = 1;
    static final int AVAILABLE = 2;
    static final int IN_PROGRESS = 3;
    // InstallStatus
    static final int PENDING = 1;
    static final int DOWNLOADING = 2;
    static final int INSTALLING = 3;
    static final int FAILED = 5;
    static final int CANCELED = 6;
    static final int DOWNLOADED = 11;
    // The flow's result (Activity.RESULT_OK, RESULT_CANCELED, ActivityResult.RESULT_IN_APP_UPDATE_FAILED)
    static final int RESULT_OK = -1;
    static final int RESULT_CANCELED = 0;

    private PlayStates() {}

    /**
     * Where the update stands: what is under way first (a download goes on while an update is still listed as
     * available), then whether Play has one. An immediate update in progress is Play's full screen, said as
     * installing. Anything Play cannot tell is none.
     */
    static String state(int availability, int install) {
        switch (install) {
            case DOWNLOADED:
                return "downloaded";
            case INSTALLING:
                return "installing";
            case DOWNLOADING:
                return "downloading";
            case PENDING:
                return "pending";
            default:
                break;
        }
        if (availability == IN_PROGRESS) return "installing";
        if (availability == AVAILABLE) return "available";
        return "none";
    }

    /** Why a download stopped, as Play's listener reports it; null while it goes on. */
    static String stopped(int install) {
        if (install == FAILED) return "failed";
        if (install == CANCELED) return "cancelled";
        return null;
    }

    /** How Play's own window ended: null when the person accepted, else why not. */
    static String flowEnded(int result) {
        if (result == RESULT_OK) return null;
        if (result == RESULT_CANCELED) return "declined";
        return "failed";
    }

    /** The share downloaded, 0 to 100, or null before Play knows the size. */
    static Integer percent(long done, long total) {
        if (total <= 0 || done < 0) return null;
        return (int) Math.min(100, done * 100 / total);
    }
}
