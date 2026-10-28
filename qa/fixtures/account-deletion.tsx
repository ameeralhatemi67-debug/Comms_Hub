// «طلب حذف حسابي» (src/components/account-deletion.tsx) and «طلبات حذف الحساب» (src/components/accounts/deletions.tsx)
// on a fixture page for qa/account-deletion.cjs (MVP_draft.md 64.6). Both need a signed-in person on the real site;
// here the database client and the accounts provider are stand-ins (fake-deletion-supabase.ts,
// fake-accounts-data.ts) that record what the components ask. The rules themselves are run against the real
// database in supabase/tests/account_deletion_rules.sql.
import { createRoot } from 'react-dom/client';
import type { Account } from '../../src/lib/access';
import { AccountProvider } from '../../src/lib/account-context';
import { AccountDeletionPanel } from '../../src/components/account-deletion';
import { DeletionRequests } from '../../src/components/accounts/deletions';

const w = window as unknown as { __removing: string[] };
w.__removing = [];
const me = { email: 'writer@example.test', name: 'كاتب الفحص', role: 'writer', pages: [], protected: false, caps: [] } as unknown as Account;

createRoot(document.getElementById('root')!).render(
  <main dir="rtl" style={{ padding: 16 }}>
    <h1 id="where">حذف الحساب</h1>
    <section id="person">
      <AccountProvider account={me}>
        <AccountDeletionPanel />
      </AccountProvider>
    </section>
    <section id="admins" className="panel">
      <DeletionRequests onRemove={(email) => w.__removing.push(email)} />
    </section>
  </main>,
);
