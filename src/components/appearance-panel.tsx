'use client';
// «المظهر» on the account page (Action_Plan.md B3): the mode is a person's own choice. It is kept
// in this browser only, as it always was (src/lib/identity.ts); nothing is sent to the database.
// The design itself is no longer a choice: «الهوية الجديدة لمركز الاتصال» is the only design.
import { setTheme } from '@/lib/identity';
import { useTheme } from '@/lib/use-identity';

export function AppearancePanel() {
  const theme = useTheme();
  return (
    <div className="ap-look">
      <div className="notice">
        <b>الوضع</b>
        <small>الوضع الفاتح هو الافتراضي. الوضع الداكن اختيار شخصي يُحفظ في هذا المتصفح.</small>
        <div className="seg" role="group" aria-label="الوضع">
          <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
            فاتح
          </button>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
            داكن
          </button>
        </div>
      </div>
      <p className="muted">الوضع يُحفظ في هذا المتصفح وحده، ولا يراه غيرك.</p>
    </div>
  );
}
