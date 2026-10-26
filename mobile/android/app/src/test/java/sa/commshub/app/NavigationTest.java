package sa.commshub.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

/** Where an address goes (Navigation; the desktop's rules, DT-01, as the Android application keeps them). */
public class NavigationTest {

    private static final String SITE = "https://comms-hub-three.vercel.app";
    private static final List<String> RELEASE = Arrays.asList(SITE);
    private static final List<String> CHECK = Arrays.asList(SITE, "http://127.0.0.1:3000");

    @Test
    public void onlyTheExactListedOriginIsTheSite() {
        assertTrue(Navigation.isAllowed(SITE + "/work/CH-101", RELEASE));
        assertTrue(Navigation.isAllowed("https://COMMS-HUB-THREE.vercel.app:443/", RELEASE));
        assertFalse(Navigation.isAllowed("https://comms-hub-three.vercel.app.example.com/", RELEASE));
        assertFalse(Navigation.isAllowed("http://comms-hub-three.vercel.app/", RELEASE));
        assertFalse(Navigation.isAllowed("https://user:pass@comms-hub-three.vercel.app/", RELEASE));
        assertFalse(Navigation.isAllowed("http://127.0.0.1:3000/", RELEASE));
        assertTrue(Navigation.isAllowed("http://127.0.0.1:3000/mail", CHECK));
        assertFalse(Navigation.isAllowed("http://127.0.0.1:3001/", CHECK));
        assertFalse(Navigation.isAllowed("http://localhost:3000/", CHECK));
        assertFalse(Navigation.isAllowed("file:///sdcard/x.html", CHECK));
        assertFalse(Navigation.isAllowed(null, CHECK));
    }

    @Test
    public void pagesOfTheSiteStay() {
        for (String path : new String[] { "/", "/work", "/mail/chat?room=1", "/media/abc", "/w/token", "/app/return?code=x", "/api/media/1/content?download=1" }) {
            assertEquals(path, Navigation.Action.STAY, Navigation.decide(SITE + path, RELEASE));
        }
    }

    @Test
    public void outsideConnectionsGoToTheBrowserAfterTheNote() {
        for (String path : new String[] { "/api/drive/connect", "/api/onedrive/connect/", "/api/platforms/connect/meta", "/api/platforms/connect/google?x=1" }) {
            assertEquals(path, Navigation.Action.NOTE_THEN_BROWSER, Navigation.decide(SITE + path, RELEASE));
        }
        assertEquals(Navigation.Action.STAY, Navigation.decide(SITE + "/api/platforms/connect/", RELEASE));
        assertEquals(Navigation.Action.STAY, Navigation.decide(SITE + "/api/drive/connected", RELEASE));
    }

    @Test
    public void pagesForOutsidePeopleOpenInTheBrowser() {
        assertEquals(Navigation.Action.BROWSER, Navigation.decide(SITE + "/r/abcdef", RELEASE));
        assertEquals(Navigation.Action.BROWSER, Navigation.decide(SITE + "/m/abcdef", RELEASE));
        assertEquals(Navigation.Action.STAY, Navigation.decide(SITE + "/requests", RELEASE));
    }

    @Test
    public void otherAddressesLeaveOrAreRefused() {
        assertEquals(Navigation.Action.BROWSER, Navigation.decide("https://example.com/", RELEASE));
        assertEquals(Navigation.Action.BROWSER, Navigation.decide("https://accounts.google.com/o/oauth2", RELEASE));
        assertEquals(Navigation.Action.MAIL, Navigation.decide("mailto:someone@example.com", RELEASE));
        assertEquals(Navigation.Action.REFUSE, Navigation.decide("intent://scan/#Intent;scheme=zxing;end", RELEASE));
        assertEquals(Navigation.Action.REFUSE, Navigation.decide("javascript:alert(1)", RELEASE));
        assertEquals(Navigation.Action.REFUSE, Navigation.decide("file:///data/data/sa.commshub.app/x", RELEASE));
        assertEquals(Navigation.Action.REFUSE, Navigation.decide("blob:https://comms-hub-three.vercel.app/1", RELEASE));
        assertEquals(Navigation.Action.REFUSE, Navigation.decide("https://user:pass@comms-hub-three.vercel.app/", RELEASE));
        assertEquals(Navigation.Action.REFUSE, Navigation.decide("not a url", RELEASE));
    }
}
