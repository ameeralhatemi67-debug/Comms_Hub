import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { needProps } from '@/lib/kit/need';
import { Empty, Panel, Title } from './ui';

/** Shown in place of a page the signed-in person has not been granted. */
export function NoAccess({ askCreate = false }: { askCreate?: boolean }) {
  return (
    <div dir="rtl">
      <Title title="لا تملك صلاحية هذه الصفحة" sub="الصلاحية يمنحها مسؤول النظام من صفحة الحسابات" />
      <Panel>
        <Empty>
          <ShieldAlert />
          <p>
            هذه الصفحة غير مفتوحة لحسابك. إن احتجتها فاطلبها من مسؤول النظام. <Link href="/">العودة للرئيسية</Link>
          </p>
          {askCreate && (
            <button type="button" className="secondary" {...needProps('page.create', 'يفتحها مدير الاتصال أو مسؤول النظام، لدورك كله أو لك وحدك.')}>
              اطلب هذه الصلاحية
            </button>
          )}
        </Empty>
      </Panel>
    </div>
  );
}
