'use client';
// «الحسابات» (Permissions_Plan.md 5): who is in the hub, with which role, and what each
// may do. Four tabs: «الأعضاء» (the list, with a person's card beside it), «الأدوار» (each
// role's defaults), «الطلبات» (access and permission requests), «السجل» (every change).
// It opens with «فتح صفحة الحسابات»: the administrator, the director and the assistant by
// default. What each sees and may do here is decided in the database.
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRound, Package, Plus } from 'lucide-react';
import { Empty, Panel, Tabs, Title } from '../ui';
import { AccountsProvider, useAccounts, type AccessRequest } from './data';
import { AccessRequests, MemberDialog, MembersTab } from './members';
import { GrantDialog, PersonCard, PresetDialog } from './card';
import { RolesTab } from './roles';
import { LogTab } from './log';

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
  const [tab, setTab] = useState(search?.get('tab') ?? 'members');
  const [person, setPerson] = useState<string | null>(search?.get('person') ?? null);
  const [adding, setAdding] = useState(false);
  const [approving, setApproving] = useState<AccessRequest | null>(null);
  const [granting, setGranting] = useState<{ emails: string[]; cap?: string } | null>(null);
  const [presetNew, setPresetNew] = useState(false);

  if (!a.can('accounts.view'))
    return (
      <Panel>
        <Empty>«الحسابات» لمن يملك «فتح صفحة الحسابات»: مسؤول النظام ومدير الاتصال ومساعده افتراضياً. صلاحياتك أنت في صفحة «الحساب».</Empty>
      </Panel>
    );

  const waiting = a.requests.length;
  const tabs = [
    { id: 'members', label: `الأعضاء (${a.members.length})` },
    { id: 'roles', label: 'الأدوار' },
    { id: 'requests', label: waiting ? `الطلبات (${waiting})` : 'الطلبات' },
    { id: 'log', label: 'السجل' },
  ];
  const added = (email: string) => {
    setAdding(false);
    setApproving(null);
    setTab('members');
    setPerson(email);
  };

  return (
    <div dir="rtl" className="pm">
      <Title title="الحسابات" sub="من يدخل المركز، بأي دور، وما يستطيع كل واحد فعله ومن أين جاءه">
        <button
          type="button"
          className="primary pm-add"
          disabled={!a.can('members.invite')}
          title={a.can('members.invite') ? '' : 'الإضافة لمن يملك «إضافة الأعضاء وقبول طلبات الوصول».'}
          onClick={() => setAdding(true)}
        >
          <Plus />
          إضافة عضو
        </button>
        {a.can('permissions.grant') && (
          <button type="button" className="secondary pm-newpreset" onClick={() => setPresetNew(true)}>
            <Package />
            حزمة جديدة
          </button>
        )}
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
          {person && <PersonCard key={person} email={person} onClose={() => setPerson(null)} onGrant={(emails, cap) => setGranting({ emails, cap })} />}
        </div>
      )}
      {tab === 'roles' && <RolesTab />}
      {tab === 'requests' && (
        <div className="pm-reqs">
          <Panel title={`طلبات الوصول إلى المركز${a.requests.length ? ` (${a.requests.length})` : ''}`}>
            <AccessRequests onApprove={setApproving} />
          </Panel>
        </div>
      )}
      {tab === 'log' && <LogTab person={person} />}

      {a.presets.length > 0 && tab === 'members' && (
        <p className="muted pm-presetline">
          <KeyRound /> الحزم المحفوظة: {a.presets.map((p) => p.name).join('، ')}. تُطبَّق من بطاقة العضو.
        </p>
      )}

      {adding && <MemberDialog mode="add" onClose={() => setAdding(false)} onAdded={added} />}
      {approving && <MemberDialog mode="approve" request={approving} onClose={() => setApproving(null)} onAdded={added} />}
      {granting && <GrantDialog emails={granting.emails} initial={granting.cap} onClose={() => setGranting(null)} />}
      {presetNew && <PresetDialog onClose={() => setPresetNew(false)} />}
    </div>
  );
}
