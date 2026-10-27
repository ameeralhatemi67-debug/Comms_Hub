package sa.commshub.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

/** Which files of the site a page may have the application save, open or share (SiteFiles; MVP_draft.md 64.2). */
public class SiteFilesTest {

    private static final String SITE = "https://comms-hub-three.vercel.app";
    private static final List<String> RELEASE = Arrays.asList(SITE);
    private static final List<String> CHECK = Arrays.asList(SITE, "http://127.0.0.1:3000");
    private static final String ID = "3f2b8c1e-0a4d-4c6b-9e7f-1a2b3c4d5e6f";

    @Test
    public void theSiteFileRoutesAndNothingElse() {
        for (String ok : new String[] {
            "/api/media/" + ID + "/content",
            "/api/media/" + ID + "/content?download=1",
            "/api/media/" + ID + "/content?v=3",
            "/api/media/" + ID + "/content?v=12&download=1",
            "/api/chat/file/" + ID,
            "/api/mail/file/" + ID.toUpperCase(),
            "/api/mail/inbound/" + ID + "/0",
            "/api/mail/inbound/" + ID + "/12",
        }) assertEquals(ok, ok, SiteFiles.path(ok));
        for (String no : new String[] {
            null,
            "",
            "/",
            "/privacy.html",
            "/api/media/" + ID + "/content?v=0",
            "/api/media/" + ID + "/content?v=3&x=1",
            "/api/media/" + ID + "/content?download=1&v=3",
            "/api/media/" + ID + "/content#x",
            "/api/media/" + ID + "/../../health",
            "/api/media/" + ID + "/content/",
            "/api/media/not-an-id/content",
            "/api/chat/file/" + ID + "/x",
            "/api/mail/inbound/" + ID + "/123",
            "//evil.example/api/chat/file/" + ID,
            SITE + "/api/chat/file/" + ID,
            "api/chat/file/" + ID,
            "/api/chat/file/" + ID + "\n",
            "/API/CHAT/FILE/" + ID,
        }) assertNull(String.valueOf(no), SiteFiles.path(no));
    }

    @Test
    public void theAddressIsBuiltOnThePageOwnOriginOnly() {
        String path = "/api/chat/file/" + ID;
        assertEquals(SITE + path, SiteFiles.address(SITE + "/mail/chat?room=1", path, RELEASE));
        assertEquals("http://127.0.0.1:3000" + path, SiteFiles.address("http://127.0.0.1:3000/", path, CHECK));
        assertNull(SiteFiles.address("http://127.0.0.1:3000/", path, RELEASE));
        assertNull(SiteFiles.address("https://evil.example/", path, RELEASE));
        assertNull(SiteFiles.address(null, path, RELEASE));
        assertNull(SiteFiles.address(SITE + "/", "/privacy.html", RELEASE));
    }

    @Test
    public void photosAndVideosToTheGalleryEverythingElseToDownloads() {
        assertEquals(SiteFiles.Place.IMAGES, SiteFiles.placeOf("image/png"));
        assertEquals(SiteFiles.Place.IMAGES, SiteFiles.placeOf("IMAGE/JPEG"));
        assertEquals(SiteFiles.Place.VIDEOS, SiteFiles.placeOf("video/mp4"));
        assertEquals(SiteFiles.Place.DOWNLOADS, SiteFiles.placeOf("application/pdf"));
        assertEquals(SiteFiles.Place.DOWNLOADS, SiteFiles.placeOf("audio/mpeg"));
        assertEquals(SiteFiles.Place.DOWNLOADS, SiteFiles.placeOf(null));
    }

    @Test
    public void thePageNameIsPlainTextOnly() {
        assertEquals("تقرير.pdf", SiteFiles.name("تقرير.pdf"));
        assertEquals("x.pdf", SiteFiles.name("../../x.pdf"));
        assertNull(SiteFiles.name(null));
        assertNull(SiteFiles.name("..."));
    }

    @Test
    public void theSizeBeforeALargeShare() {
        assertEquals("60 ميغابايت", SiteFiles.size(60L * 1024 * 1024));
        assertEquals("2.5 غيغابايت", SiteFiles.size((long) (2.5 * 1024 * 1024 * 1024)));
        assertEquals(50L * 1024 * 1024, SiteFiles.ASK_TO_SHARE);
    }
}
