'use client';
// «نشر مباشر» (MVP_draft.md section 76, Director_Notes_Plan.md N-2), opened from Home's «إجراءات سريعة»: the director, or the Admin,
// publishes for real to a connected YouTube channel or Instagram account, outside the work cycle. It is the engine and form of
// «تجربة النشر» in their direct mode (youtube-test.tsx, instagram-test.tsx); every rule is the database's (publish.direct, fixed to
// the Admin and the director). The other platforms of the registry show «قريباً». Publishing works stays a simulation.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetHead } from '../sheet';
import { PlatformTile } from '../platform-icon';
import { accountName, type AccountRow } from '@/lib/work/rules';
import { useWork } from './data';
import { Hint } from './parts';
import { InstagramTest } from './instagram-test';
import { YouTubeTest } from './youtube-test';

/** The platforms «نشر مباشر» publishes to now. */
export const DIRECT_PLATFORMS: readonly string[] = ['youtube', 'instagram'];
/** Platforms never offered here, not even as «قريباً»: mail is not a publishing platform. */
const NOT_PUBLISHING = ['mail'];

/** The accounts a direct post may go to: connected for real, and on. The database checks the same and more. */
export const directAccounts = (accounts: AccountRow[], platform: string) =>
  accounts.filter((a) => a.platform === platform && a.conn_kind === 'oauth' && a.active);

export function DirectPublishSheet({ onClose }: { onClose: () => void }) {
  const w = useWork();
  const router = useRouter();
  const [platform, setPlatform] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const label = (k: string) => w.platforms.find((p) => p.key === k)?.label_ar ?? k;
  const soon = w.platforms.filter((p) => !DIRECT_PLATFORMS.includes(p.key) && !NOT_PUBLISHING.includes(p.key) && p.kind === 'social');
  const accounts = platform ? directAccounts(w.accounts, platform) : [];
  const account = accounts.find((a) => a.id === chosen) ?? (accounts.length === 1 ? accounts[0] : null);
  const reconnect = () => router.push('/channels');

  return (
    <Sheet label="نشر مباشر" onClose={onClose}>
      <SheetHead
        title="نشر مباشر"
        sub="ينشر فعلاً على المنصة، خارج دورة العمل. لمدير الاتصال المؤسسي ومسؤول النظام فقط، ويُسجَّل في «سجل النشاط»."
        onClose={onClose}
      />
      <div className="dp-sheet" data-dp="sheet">
        <h3 id="dp-where">أين؟</h3>
        <div className="dp-platforms" role="group" aria-labelledby="dp-where">
          {DIRECT_PLATFORMS.map((k) => {
            const n = directAccounts(w.accounts, k).length;
            return (
              <button
                key={k}
                type="button"
                className="dp-platform"
                aria-pressed={platform === k}
                disabled={n === 0}
                data-dp-platform={k}
                onClick={() => {
                  setPlatform(k);
                  setChosen(null);
                }}
              >
                <PlatformTile k={k} />
                <b>{label(k)}</b>
                <small>{n === 0 ? 'لا حساب متصل' : n === 1 ? 'حساب متصل' : `${n} حسابات متصلة`}</small>
              </button>
            );
          })}
          {soon.map((p) => (
            <button key={p.key} type="button" className="dp-platform soon" disabled aria-disabled="true" data-dp-soon={p.key}>
              <PlatformTile k={p.key} />
              <b>{p.label_ar}</b>
              <small>قريباً</small>
            </button>
          ))}
        </div>
        {!platform && <Hint>اختر المنصة. يوتيوب وإنستغرام فقط الآن، والباقي قريباً.</Hint>}

        {platform && accounts.length > 1 && (
          <>
            <h3 id="dp-account">الحساب</h3>
            <div className="wk-seg dp-accounts" role="group" aria-labelledby="dp-account" data-dp="accounts">
              {accounts.map((a) => (
                <button key={a.id} type="button" aria-pressed={account?.id === a.id} onClick={() => setChosen(a.id)}>
                  {accountName(a)}
                </button>
              ))}
            </div>
          </>
        )}

        {account?.platform === 'youtube' && <YouTubeTest key={account.id} a={account} mode="direct" onReconnect={reconnect} />}
        {account?.platform === 'instagram' && <InstagramTest key={account.id} a={account} mode="direct" onReconnect={reconnect} />}
      </div>
    </Sheet>
  );
}
