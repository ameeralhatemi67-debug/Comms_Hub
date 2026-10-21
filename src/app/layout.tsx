import type { Metadata } from 'next';
import { Store } from '@/lib/store';
import { Shell } from '@/components/shell';
import { KitProvider } from '@/components/kit';
import { AuthGate } from '@/components/auth-gate';
import { CapsProvider } from '@/components/caps';
import { AccountProvider } from '@/lib/account-context';
import { canSwitchRole } from '@/lib/access';
import { getSession } from '@/lib/supabase/session';
import { IDENTITY_NEW } from '@/lib/identity';
import { RESTORE_THEME } from '@/lib/csp';
// Fonts of the design, served from the app rather than Google Fonts.
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
import './kit.css';
import './work.css';
import './permissions.css';

export const metadata: Metadata = {
  title: 'مركز الاتصال المؤسسي',
  description: 'نموذج تجربة المستخدم لمركز الاتصال المؤسسي، MVP 0.1',
};

// The saved theme is applied before the first paint (RESTORE_THEME, src/lib/csp.ts), so a reload never
// flashes the other theme. The pages' Content-Security-Policy allows exactly that text by its hash.
// See node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Nothing of the product is rendered for a visitor without an approved account.
  const session = await getSession();
  return (
    <html lang="ar" dir="rtl" data-identity={IDENTITY_NEW} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: RESTORE_THEME }} />
      </head>
      <body>
        {session.status === 'ready' ? (
          <AccountProvider account={session.account}>
            <CapsProvider>
              <Store role={session.account.role} roleLocked={!canSwitchRole(session.account)}>
                <KitProvider>
                  <Shell>{children}</Shell>
                </KitProvider>
              </Store>
            </CapsProvider>
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
