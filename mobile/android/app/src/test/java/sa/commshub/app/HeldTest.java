package sa.commshub.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Calendar;
import java.util.TimeZone;
import org.junit.Test;

/** Held files, shared-in addresses and background uploads (Held, Uploads, UploadWorker; MVP_draft.md 64.5). */
public class HeldTest {

    @Test
    public void aSharedFileIsReadOnlyFromAnotherApplicationsProvider() {
        String own = "sa.commshub.app.fileprovider";
        assertTrue(Held.acceptable("content", "com.whatsapp.provider.media", own));
        assertTrue(Held.acceptable("CONTENT", "media", own));
        assertFalse("never a file address", Held.acceptable("file", "", own));
        assertFalse(Held.acceptable("file", null, own));
        assertFalse("never this application's own files", Held.acceptable("content", own, own));
        assertFalse(Held.acceptable("content", "SA.COMMSHUB.APP.FILEPROVIDER", own));
        assertFalse(Held.acceptable("content", "", own));
        assertFalse(Held.acceptable("https", "example.com", own));
        assertFalse(Held.acceptable(null, "media", own));
    }

    @Test
    public void byteRangesAsTheBrowserAsksForThem() {
        assertNull(Held.range(null, 1000));
        assertArrayEquals(new long[] { 0, 999 }, Held.range("bytes=0-", 1000));
        assertArrayEquals(new long[] { 100, 199 }, Held.range("bytes=100-199", 1000));
        assertArrayEquals(new long[] { 900, 999 }, Held.range("bytes=900-5000", 1000));
        assertArrayEquals(new long[] { 950, 999 }, Held.range("bytes=-50", 1000));
        assertArrayEquals(new long[] { 0, 999 }, Held.range("bytes=-5000", 1000));
        for (String bad : new String[] { "bytes=1000-", "bytes=500-100", "bytes=-0", "bytes=-", "items=0-1", "bytes=0-1,5-6", "bytes=x-1" }) {
            assertArrayEquals(bad, new long[] { -1, -1 }, Held.range(bad, 1000));
        }
    }

    @Test
    public void tokensAndCameraNames() {
        String t = Held.newToken();
        assertTrue(Held.isToken(t));
        assertEquals(64, t.length());
        assertFalse("lower case only", Held.isToken(t.toUpperCase()));
        assertFalse("no path", Held.isToken("../" + t.substring(3)));
        assertFalse("none", Held.isToken(null));
        Calendar c = Calendar.getInstance(TimeZone.getDefault());
        c.set(2026, Calendar.OCTOBER, 27, 14, 30, 5);
        assertEquals("صورة-20261027-143005.jpg", Held.cameraName(false, c.getTime()));
        assertEquals("فيديو-20261027-143005.mp4", Held.cameraName(true, c.getTime()));
    }

    @Test
    public void anUploadGoesOnlyToGoogleDrivesUploadAddress() {
        String[] release = { "https://www.googleapis.com/upload/drive/" };
        assertTrue(Uploads.allowedSession("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=ABC", release));
        for (String no : new String[] {
            null, "", "https://www.googleapis.com/upload/drive/", "https://www.googleapis.com/drive/v3/files", "http://www.googleapis.com/upload/drive/v3/files",
            "https://www.googleapis.com.evil.example/upload/drive/v3", "https://evil.example/upload/drive/", "http://127.0.0.1:3004/upload/x",
        }) assertFalse(String.valueOf(no), Uploads.allowedSession(no, release));
        String[] check = { "https://www.googleapis.com/upload/drive/", "http://127.0.0.1:3004/upload/" };
        assertTrue(Uploads.allowedSession("http://127.0.0.1:3004/upload/s1", check));
    }

    @Test
    public void theResumableProtocolsAnswers() {
        assertEquals(0, UploadWorker.nextOffset(null));
        assertEquals(8388608, UploadWorker.nextOffset("bytes=0-8388607"));
        assertEquals(0, UploadWorker.nextOffset("bytes=5-10"));
        assertEquals("1AbC_d-ef0123456789", UploadWorker.fileIdOf("{\"kind\":\"drive#file\",\"id\":\"1AbC_d-ef0123456789\",\"name\":\"x\"}"));
        assertNull(UploadWorker.fileIdOf("{\"id\":\"short\"}"));
        assertNull(UploadWorker.fileIdOf(null));
        assertEquals(8 * 1024 * 1024, UploadWorker.CHUNK);
    }
}
