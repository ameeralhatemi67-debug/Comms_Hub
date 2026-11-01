'use client';
// «الحسابات» (Permissions_Plan.md 5): who is in the hub, with which role, and what each
// may do. Four tabs: «الأعضاء» (the list, with a person's card beside it), «الأدوار» (one role and the
// people who hold it, side by side), «الطلبات» (access, permission and account deletion requests),
// «السجل» (every change to accounts and permissions).
// It opens with «فتح صفحة الحسابات»: the administrator, the director and the assistant by
// default. What each sees and may do here is decided in the database.
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { Role } from '@/lib/domain';
import { Empty, Panel, Tabs, Title } from '../ui';
import { AccountsProvider, useAccounts, type AccessRequest } from './data';
import { AccessRequests, MemberDialog, MembersTab, RemoveDialog } from './members';
import { DeletionRequests } from './deletions';
import { GrantDialog, PersonCard, PresetDialog } from './card';
import { RolesTab } from './roles';
import { LogTab } from './log';
import { PermRequestList, usePermRequests } from '../perm-requests';
import { needProps } from '@/lib/kit/need';

export function AccountsPage() {
  return (
    <AccountsProvider>
      <Accounts />
    </AccountsProvider>
  );
}

function Accounts() {
  const a = useAccounts();
  const search = useSearchParams();
  const perm = usePermRequests();
  const [tab, setTab] = useState(search?.get('tab') ?? 'members');
  const [person, setPerson] = useState<string | null>(search?.get('person') ?? null);
  const [roleView, setRoleView] = useState<string | null>(search?.get('role') ?? null);
  const [adding, setAdding] = useState(false);
  const [approving, setApproving] = useState<AccessRequest | null>(null);
  const [granting, setGranting] = useState<{ emails: string[]; cap?: string } | null>(null);
  const [presetNew, setPresetNew] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  if (!a.can('accounts.view'))
    return (
      <Panel>
        <Empty>«الحسابات» لمن يملك «فتح صفحة الحسابات»: مسؤول النظام ومدير الاتصال ومساعده افتراضياً. صلاحياتك أنت في صفحة «الحساب».</Empty>
      </Panel>
    );

  const waiting = a.requests.length + a.deletions.length + perm.list.filter((q) => q.can_decide).length;
  const tabs = [
    { id: 'members', label: `الأعضاء (${a.members.length})` },
    { id: 'roles', label: 'الأدوار' },
    { id: 'requests', label: waiting ? `الطلبات (${waiting})` : 'الطلبات' },
    { id: 'log', label: 'السجل' },
  ];
  const openPerson = (email: string) => {
    setTab('members');
    setPerson(email);
  };
  const added = (email: string) => {
    setAdding(false);
    setApproving(null);
    openPerson(email);
  };
  const compare = (role: Role) => {
    setRoleView(role);
    setTab('roles');
  };

  return (
    <div dir="rtl" className="pm">
      <Title title="الحسابات" sub="من يدخل المركز، بأي دور، وما يستطيع كل واحد فعله ومن أين جاءه">
        <button
          type="button"
          className="primary pm-add"
          {...(a.can('members.invite') ? {} : needProps('members.invite', 'الإضافة لمن يملك «إضافة الأعضاء وقبول طلبات الوصول»: المدير ومسؤول النظام افتراضياً.'))}
          onClick={() => setAdding(true)}
        >
          <Plus />
          إضافة عضو
        </button>
      </Title>
      {a.status === 'error' && (
        <p className="warning" role="alert">
          تعذّر تحميل الحسابات. أعد تحميل الصفحة.
        </p>
      )}
      <div className="pm-tabs">
        <Tabs items={tabs} value={tab} onChange={setTab} />
      </div>

      {tab === 'members' && (
        <div className={`pm-split ${person ? 'with-card' : ''}`}>
          <MembersTab selected={person} onOpen={setPerson} onGrant={(emails) => setGranting({ emails })} />
          {person && <PersonCard key={person} email={person} onClose={() => setPerson(null)} onGrant={(emails, cap) => setGranting({ emails, cap })} onCompare={compare} />}
        </div>
      )}
      {tab === 'roles' && <RolesTab first={roleView} onOpen={openPerson} onNewPreset={() => setPresetNew(true)} />}
      {tab === 'requests' && (
        <div className="pm-reqs">
          <Panel title="طلبات الصلاحيات">
            <PermRequestList empty="لا طلبات صلاحيات تراها." />
          </Panel>
          <Panel title={`طلبات الوصول إلى المركز${a.requests.length ? ` (${a.requests.length})` : ''}`}>
            <AccessRequests onApprove={setApproving} />
          </Panel>
          {(a.can('members.remove') || a.deletions.length > 0) && (
            <Panel title={`طلبات حذف الحساب${a.deletions.length ? ` (${a.deletions.length})` : ''}`}>
              <DeletionRequests onRemove={setRemoving} />
            </Panel>
          )}
        </div>
      )}
      {tab === 'log' && <LogTab person={person} />}

      {adding && <MemberDialog mode="add" onClose={() => setAdding(false)} onAdded={added} />}
      {approving && <MemberDialog mode="approve" request={approving} onClose={() => setApproving(null)} onAdded={added} />}
      {granting && <GrantDialog emails={granting.emails} initial={granting.cap} onClose={() => setGranting(null)} />}
      {presetNew && <PresetDialog onClose={() => setPresetNew(false)} />}
      {removing && (
        <RemoveDialog
          emails={[removing]}
          onClose={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            void a.reload();
          }}
        />
      )}
    </div>
  );
}
