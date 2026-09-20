import { LogoLoader } from '@/components/ui';

export default function Loading() {
  return (
    <div
      className="panel"
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '360px',
        gap: '24px',
        textAlign: 'center',
      }}
    >
      <LogoLoader size={72} ariaLabel="جارٍ تجهيز مساحة العمل…" />
      <div>
        <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>جارٍ تجهيز مساحة العمل…</h2>
        <p className="muted" style={{ margin: 0 }}>يتم تحميل البيانات وإعداد الواجهة</p>
      </div>
    </div>
  );
}
