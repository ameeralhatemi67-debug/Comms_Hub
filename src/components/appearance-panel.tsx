'use client';
// «المظهر» on the account page (Action_Plan.md B3): the two choices that were on the settings
// page and are a person's own, the design and the mode. Both are kept in this browser only, as
// they always were (src/lib/identity.ts); nothing is sent to the database.
import { setTheme, toggleIdentity } from '@/lib/identity';
import { useIdentity, useTheme } from '@/lib/use-identity';

export function AppearancePanel() {
  const second = useIdentity();
  const theme = useTheme();
  return (
    <div className="ap-look">
      <div className="notice">
        <b>التصميم</b>
        <small>الهوية الجديدة لمركز الاتصال أو التصميم الحالي</small>
        <div className="seg" role="group" aria-label="التصميم">
          <button type="button" aria-pressed={!second} onClick={() => second && toggleIdentity()}>
            التصميم الحالي
          </button>
          <button type="button" aria-pressed={second} onClick={() => !second && toggleIdentity()}>
            الهوية الجديدة
          </button>
        </div>
      </div>
      <div className="notice">
        <b>الوضع</b>
        <small>
          {second
            ? 'الوضع الفاتح هو الافتراضي. الوضع الداكن اختيار شخصي يُحفظ في هذا المتصفح.'
            : 'الوضع الداكن متاح في الهوية الجديدة فقط. فعّلها من الخيار أعلاه.'}
        </small>
        <div className="seg" role="group" aria-label="الوضع">
          <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
            فاتح
          </button>
          <button
            type="button"
            aria-pressed={theme === 'dark'}
            disabled={!second}
            title={!second ? 'متاح في الهوية الجديدة فقط' : ''}
            onClick={() => setTheme('dark')}
          >
            داكن
          </button>
        </div>
      </div>
      <p className="muted">التصميم والوضع يُحفظان في هذا المتصفح وحده، ولا يراهما غيرك.</p>
    </div>
  );
}
