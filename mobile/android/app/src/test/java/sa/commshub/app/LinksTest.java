package sa.commshub.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** Which links of the site open the application, and where (Links; MVP_draft.md 64.4). */
public class LinksTest {

    private static final String SITE = "https://comms-hub-three.vercel.app";
    private static final String LOCAL = "http://127.0.0.1:3000";

    @Test
    public void theSitePagesAndTheMemberLinksOpenOnTheBuildAddress() {
        assertEquals(SITE + "/work/CH-101", Links.target(SITE + "/work/CH-101", SITE, SITE));
        assertEquals(SITE + "/work", Links.target(SITE + "/work", SITE, SITE));
        assertEquals(SITE + "/approvals?tab=publish", Links.target(SITE + "/approvals?tab=publish", SITE, SITE));
        assertEquals(LOCAL + "/mail/chat?room=1", Links.target(SITE + "/mail/chat?room=1", SITE, LOCAL));
        assertEquals(SITE + "/w/abc.def", Links.target(SITE + "/w/abc.def", SITE, SITE));
        assertEquals(SITE + "/app/return?code=x", Links.target(SITE + "/app/return?code=x", SITE, SITE));
        assertEquals(SITE + "/media/3f2b8c1e-0a4d-4c6b-9e7f-1a2b3c4d5e6f", Links.target("https://COMMS-HUB-THREE.vercel.app:443/media/3f2b8c1e-0a4d-4c6b-9e7f-1a2b3c4d5e6f", SITE, SITE));
    }

    @Test
    public void everythingElseStaysWithTheBrowser() {
        for (String no : new String[] {
            SITE, SITE + "/", SITE + "/r/token", SITE + "/m/token", SITE + "/api/media/x/content", SITE + "/workx",
            SITE + "/app/returns", SITE + "/n/notice/x", SITE + "/privacy.html",
            SITE + "/work/../api/x", SITE + "/work/%2e%2e/api/x", SITE + "/work/%2E%2E/api", SITE + "/work/./x",
            "http://comms-hub-three.vercel.app/work", "https://evil.example/work", "https://comms-hub-three.vercel.app.evil.example/work",
            "https://user@comms-hub-three.vercel.app/work", "intent://work#Intent;end", null, "",
        }) assertNull(String.valueOf(no), Links.target(no, SITE, SITE));
    }

    @Test
    public void theClaimedPathsAreTheSitePagesAndTheTwoLinks() {
        assertEquals(18, Links.PREFIXES.size());
        assertEquals("/w/", Links.PREFIXES.get(16));
        assertEquals("/app/return", Links.PREFIXES.get(17));
    }
}
