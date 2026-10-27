package sa.commshub.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** What a push may open and where it is shown (Push; MVP_draft.md 64.3), as src/lib/native/push.ts decides it. */
public class PushTest {

    @Test
    public void aPushOpensAPageOfTheSiteOnly() {
        for (String ok : new String[] { "/n/notice/3f2b8c1e-0a4d-4c6b-9e7f-1a2b3c4d5e6f", "/work/CH-101", "/approvals?tab=publish", "/mail/chat?room=abc&msg=1", "/mail" }) {
            assertEquals(ok, ok, Push.goPath(ok));
        }
        String[] no = {
            null, "", "work", "//evil.example/x", "/\\evil.example", "https://evil.example/", "javascript:alert(1)",
            "/api/media/x/content", "/_next/static/x.js", "/r/token", "/m/token", "/_capacitor_file_/x",
            "/work\n", "/work\r", "/media/x/../api/y", "/./api", "/work#x", "/work x", "/عمل",
        };
        for (String go : no) assertNull(String.valueOf(go), Push.goPath(go));
        StringBuilder longer = new StringBuilder("/");
        for (int i = 0; i < 300; i++) longer.append('a');
        assertNull(Push.goPath(longer.toString()));
    }

    @Test
    public void messagingAndMailToMessagesNoticesByTierInfoNever() {
        assertEquals(Push.MESSAGES, Push.channelOf("chat", "decide"));
        assertEquals(Push.MESSAGES, Push.channelOf("mail", null));
        assertEquals(Push.DECIDE, Push.channelOf("notice", "decide"));
        assertEquals(Push.ATTENTION, Push.channelOf("notice", "attention"));
        assertNull(Push.channelOf("notice", "info"));
        assertNull(Push.channelOf("notice", null));
        assertNull(Push.channelOf("other", "decide"));
        assertNull(Push.channelOf(null, null));
    }

    @Test
    public void theTextIsOneLineAndShort() {
        assertEquals("رسالة جديدة من سارة", Push.text("رسالة جديدة\nمن ‮سارة"));
        assertNull(Push.text("  \n "));
        assertNull(Push.text(null));
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < 400; i++) s.append('ع');
        assertEquals(300, Push.text(s.toString()).length());
    }
}
