import type { Metadata } from 'next';
import { Store } from '@/lib/store';
import { Shell } from '@/components/shell';
import { IDENTITY_KEY, IDENTITY_NEW } from '@/lib/identity';
// Fonts of the second design, served from the app rather than Google Fonts. The
// browser downloads them only when the second design is switched on.
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/reem-kufi/500.css';
import '@fontsource/reem-kufi/600.css';
import '@fontsource/aref-ruqaa/700.css';
import './globals.css';
import './identity.css';

export const metadata: Metadata = {
  title: 'مركز الاتصال المؤسسي',
  description: 'نموذج تجربة المستخدم لمركز الاتصال المؤسسي، MVP 0.1',
};

// Applies a saved design choice before the first paint, so a reload never flashes
// the other design. See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
const restoreIdentity = `(function(){try{if(localStorage.getItem(${JSON.stringify(IDENTITY_KEY)})===${JSON.stringify(IDENTITY_NEW)})document.documentElement.setAttribute("data-identity",${JSON.stringify(IDENTITY_NEW)})}catch(e){}})()`;

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: restoreIdentity }} />
      </head>
      <body>
        <Store>
          <Shell>{children}</Shell>
        </Store>
      </body>
    </html>
  );
}
