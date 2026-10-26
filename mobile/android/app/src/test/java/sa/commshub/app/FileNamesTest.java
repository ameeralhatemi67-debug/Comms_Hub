package sa.commshub.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The name a download is saved under (FileNames). */
public class FileNamesTest {

    @Test
    public void anArabicNameAsTheSiteWritesIt() {
        String d = "attachment; filename=\"file.pdf\"; filename*=UTF-8''%D8%AE%D8%B7%D8%A9%20%D8%A7%D9%84%D9%86%D8%B4%D8%B1.pdf";
        assertEquals("خطة النشر.pdf", FileNames.fromDisposition(d));
    }

    @Test
    public void aPlainName() {
        assertEquals("report v2.pdf", FileNames.fromDisposition("attachment; filename=\"report v2.pdf\""));
        assertEquals("a+b.txt", FileNames.fromDisposition("inline; filename*=UTF-8''a+b.txt"));
        assertEquals("plain.txt", FileNames.fromDisposition("attachment; filename=plain.txt"));
        assertNull(FileNames.fromDisposition("inline"));
        assertNull(FileNames.fromDisposition(null));
    }

    @Test
    public void neverAPath() {
        assertEquals("passwd", FileNames.fromDisposition("attachment; filename=\"../../etc/passwd\""));
        // A Windows path as a bare value keeps its backslashes, and only the last part is kept.
        assertEquals("x.exe", FileNames.fromDisposition("attachment; filename=C:\\Windows\\x.exe"));
        // Inside quotes a backslash only escapes the next character (HTTP's quoted string): no path is left.
        assertEquals("C_Windowsx.exe", FileNames.fromDisposition("attachment; filename=\"C:\\Windows\\x.exe\""));
        assertEquals("evil.sh", FileNames.safe("...evil.sh"));
        assertEquals("a_b_.txt", FileNames.safe("a:b?.txt"));
        assertEquals("cbaexe.txt", FileNames.safe("\u202ecbaexe.txt"));
        assertNull(FileNames.safe("..."));
        assertNull(FileNames.safe("/"));
    }

    @Test
    public void theNameInTheAddressWhenTheSiteGivesNone() {
        assertEquals("comms-hub-logo-512.png", FileNames.fromUrl("https://comms-hub-three.vercel.app/brand/comms-hub-logo-512.png"));
        assertEquals("خطة.pdf", FileNames.fromUrl("https://x.example/files/%D8%AE%D8%B7%D8%A9.pdf?v=2"));
        assertNull(FileNames.fromUrl("https://comms-hub-three.vercel.app/api/media/1/content?download=1"));
        assertNull(FileNames.fromUrl("https://comms-hub-three.vercel.app/"));
        assertNull(FileNames.fromUrl("https://x.example/.hidden"));
        assertNull(FileNames.fromUrl(null));
    }

    @Test
    public void aLongNameKeepsItsKind() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 200; i++) b.append('ا');
        String n = FileNames.safe(b + ".mp4");
        assertTrue(n.endsWith(".mp4"));
        assertEquals(FileNames.MAX, n.codePointCount(0, n.length()));
    }
}
