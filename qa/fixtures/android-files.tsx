// The site's files on the phone (src/components/native/phone-file.tsx, MVP_draft.md 64.2), on a fixture page for
// qa/android-files.cjs: the asset page's buttons, a picture's buttons, and the links of a mail attachment and of
// files in «المراسلة», as the pages use them. The check serves the files at the site's own file routes.
import { createRoot } from 'react-dom/client';
import { PhoneFileButtons, PhoneFileLink } from '../../src/components/native/phone-file';
import { fileAt } from '../../src/lib/native/files';

export const IDS = {
  doc: '0a4d4c6b-9e7f-4a2b-8c4d-000000000001',
  image: '0a4d4c6b-9e7f-4a2b-8c4d-000000000002',
  mail: '0a4d4c6b-9e7f-4a2b-8c4d-000000000003',
  video: '0a4d4c6b-9e7f-4a2b-8c4d-000000000004',
  large: '0a4d4c6b-9e7f-4a2b-8c4d-000000000005',
  away: '0a4d4c6b-9e7f-4a2b-8c4d-000000000006',
  slow: '0a4d4c6b-9e7f-4a2b-8c4d-000000000007',
};

createRoot(document.getElementById('root')!).render(
  <main dir="rtl" style={{ display: 'grid', gap: 18, padding: 16 }}>
    <section id="asset-doc" className="mx-toolbar actions">
      <PhoneFileButtons
        file={{ name: 'تقرير الربع.pdf', path: fileAt.media(IDS.doc, 2), downloadPath: fileAt.media(IDS.doc, undefined, true) }}
        inPage={false}
        fallback={
          <a id="browser-download" className="button" href={fileAt.media(IDS.doc, undefined, true)}>
            تنزيل
          </a>
        }
      />
    </section>
    <section id="asset-image" className="actions">
      <PhoneFileButtons file={{ name: 'شعار المركز.png', path: fileAt.media(IDS.image, 1), downloadPath: fileAt.media(IDS.image, undefined, true) }} inPage />
    </section>
    <section id="mail" className="ml-atts">
      <PhoneFileLink className="ml-att button" file={{ name: 'ملاحظات الاجتماع.txt', path: fileAt.mail(IDS.mail) }}>
        ملاحظات الاجتماع.txt
      </PhoneFileLink>
    </section>
    <section id="chat">
      <PhoneFileLink className="b-file button" file={{ name: 'مقطع.mp4', path: fileAt.chat(IDS.video) }}>
        مقطع.mp4
      </PhoneFileLink>
    </section>
    <section id="large">
      <PhoneFileLink className="button" file={{ name: 'نسخة كبيرة.bin', path: fileAt.chat(IDS.large) }}>
        نسخة كبيرة.bin
      </PhoneFileLink>
    </section>
    <section id="away">
      <PhoneFileLink className="button" file={{ name: 'بعيد.txt', path: fileAt.chat(IDS.away) }}>
        بعيد.txt
      </PhoneFileLink>
    </section>
    <section id="slow">
      <PhoneFileLink className="button" file={{ name: 'بطيء.bin', path: fileAt.chat(IDS.slow) }}>
        بطيء.bin
      </PhoneFileLink>
    </section>
  </main>,
);
