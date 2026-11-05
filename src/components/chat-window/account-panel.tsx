'use client';
// «التجارب» on «الحساب»: the switch of the mail and messaging window (MVP_draft.md 74), off by default.
import { useAccount } from '@/lib/account-context';
import { canOpen } from '@/lib/access';
import { useChatWindowSwitch } from './switch';

export function ChatWindowPanel() {
  const account = useAccount();
  const sw = useChatWindowSwitch(account.email);
  const mail = canOpen(account, 'mail');
  return (
    <div className="cw-setting">
      <div className="cw-setting-text">
        <b>
          نافذة البريد والمراسلة <span className="cw-lab">تجريبي</span>
        </b>
        <p>
          زر في أسفل يسار كل صفحة يفتح نافذة بجانبها، فيها البريد والمراسلة معاً. تبدأ صغيرة وتكبر حتى حدود القائمة
          الجانبية، وصفحة «البريد» تبقى كما هي بكل أدواتها.
        </p>
        <small>
          {mail
            ? 'مطفأة حتى تشغّلها. يُحفظ اختيارك في حسابك، ويُحفظ مكان الزر وعرض النافذة على هذا الجهاز. اختصارها Alt+M.'
            : 'تحتاج صفحة «البريد». اطلبها ممن يدير رتبتك.'}
        </small>
        {sw.error && (
          <p className="cw-error" role="alert">
            {sw.error}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        className="cw-switch"
        aria-label="نافذة البريد والمراسلة"
        aria-checked={mail && sw.on}
        disabled={!mail || !sw.loaded}
        onClick={() => void sw.set(!sw.on)}
      />
    </div>
  );
}
