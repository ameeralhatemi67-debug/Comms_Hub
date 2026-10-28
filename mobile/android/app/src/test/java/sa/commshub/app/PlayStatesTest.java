package sa.commshub.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** Google Play's numbers in the page's words (PlayStates; src/lib/native/play-update.ts, readPlayStatus). */
public class PlayStatesTest {

    @Test
    public void whatIsUnderWayComesBeforeWhetherAnUpdateExists() {
        assertEquals("downloaded", PlayStates.state(PlayStates.AVAILABLE, PlayStates.DOWNLOADED));
        assertEquals("downloading", PlayStates.state(PlayStates.AVAILABLE, PlayStates.DOWNLOADING));
        assertEquals("pending", PlayStates.state(PlayStates.AVAILABLE, PlayStates.PENDING));
        assertEquals("installing", PlayStates.state(PlayStates.AVAILABLE, PlayStates.INSTALLING));
        assertEquals("an immediate update Play left under way", "installing", PlayStates.state(PlayStates.IN_PROGRESS, 0));
        assertEquals("available", PlayStates.state(PlayStates.AVAILABLE, 0));
        assertEquals("a cancelled download leaves the update there", "available", PlayStates.state(PlayStates.AVAILABLE, PlayStates.CANCELED));
        assertEquals("none", PlayStates.state(PlayStates.NOT_AVAILABLE, 0));
        assertEquals("what Play cannot tell", "none", PlayStates.state(0, 0));
    }

    @Test
    public void whyAStopAndHowPlaysWindowEnded() {
        assertEquals("failed", PlayStates.stopped(PlayStates.FAILED));
        assertEquals("cancelled", PlayStates.stopped(PlayStates.CANCELED));
        assertNull(PlayStates.stopped(PlayStates.DOWNLOADING));
        assertNull(PlayStates.flowEnded(PlayStates.RESULT_OK));
        assertEquals("declined", PlayStates.flowEnded(PlayStates.RESULT_CANCELED));
        assertEquals("failed", PlayStates.flowEnded(1));
    }

    @Test
    public void theShareDownloaded() {
        assertNull(PlayStates.percent(0, 0));
        assertEquals(Integer.valueOf(40), PlayStates.percent(400, 1000));
        assertEquals(Integer.valueOf(100), PlayStates.percent(1200, 1000));
    }
}
