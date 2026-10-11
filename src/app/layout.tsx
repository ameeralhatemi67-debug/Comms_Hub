import type { Metadata } from 'next';
import { Store } from '@/lib/store';
import { Shell } from '@/components/shell';
import { AuthGate } from '@/components/auth-gate';
import { AccountProvider } from '@/lib/account-context';
import { canSwitchRole } from '@/lib/access';
import { getSession } from '@/lib/supabase/session';
import { IDENTITY_KEY, IDENTITY_NEW, THEME_KEY } from '@/lib/identity';
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
import './auth.css';
import './media.css';
import './mail.css';
import './chat.css';

export const metadata: Metadata = {
  title: 'مركز الاتصال المؤسسي',
  description: 'نموذج تجربة المستخدم لمركز الاتصال المؤسسي، MVP 0.1',
};

// Applies a saved design and theme choice before the first paint, so a reload never
// flashes the other design or the other theme. Light is the default: data-theme is
// "light" unless a person chose dark. The device's colour preference is not read.
// See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
const restoreIdentity = `(function(){var r=document.documentElement,t="light";try{if(localStorage.getItem(${JSON.stringify(IDENTITY_KEY)})===${JSON.stringify(IDENTITY_NEW)})r.setAttribute("data-identity",${JSON.stringify(IDENTITY_NEW)});if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark")t="dark"}catch(e){}r.setAttribute("data-theme",t)})()`;

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Nothing of the product is rendered for a visitor without an approved account.
  const session = await getSession();
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: restoreIdentity }} />
      </head>
      <body>
        {session.status === 'ready' ? (
          <AccountProvider account={session.account}>
            <Store role={session.account.role} roleLocked={!canSwitchRole(session.account)}>
              <Shell>{children}</Shell>
            </Store>
          </AccountProvider>
        ) : (
          <AuthGate
            mode={session.status === 'no-account' ? 'no-account' : session.status === 'unconfigured' ? 'unconfigured' : 'anonymous'}
            email={session.status === 'no-account' ? session.email : ''}
          />
        )}
      </body>
    </html>
  );
}
