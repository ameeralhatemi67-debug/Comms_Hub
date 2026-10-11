import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Empty, Panel, Title } from './ui';

/** Shown in place of a page the signed-in person has not been granted. */
export function NoAccess() {
  return (
    <div dir="rtl">
      <Title title="لا تملك صلاحية هذه الصفحة" sub="الصلاحية يمنحها مسؤول النظام من صفحة الحسابات" />
      <Panel>
        <Empty>
          <ShieldAlert />
          <p>
            هذه الصفحة غير مفتوحة لحسابك. إن احتجتها فاطلبها من مسؤول النظام. <Link href="/">العودة للرئيسية</Link>
          </p>
        </Empty>
      </Panel>
    </div>
  );
}
