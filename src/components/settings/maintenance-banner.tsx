'use client';
// The maintenance banner an administrator turns on in «الإعدادات», «عام» (site_settings).
// Shown above every page, live through Realtime.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export function MaintenanceBanner() {
  const [s, setS] = useState<{ on: boolean; text: string | null }>({ on: false, text: null });
  useEffect(() => {
    const db = supabase();
    const read = () =>
      db
        .from('site_settings')
        .select('maintenance_on, maintenance_text')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => data && setS({ on: !!data.maintenance_on, text: data.maintenance_text }));
    void read();
    const ch = db.channel('site-settings').on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, () => void read()).subscribe();
    return () => {
      void db.removeChannel(ch);
    };
  }, []);
  if (!s.on) return null;
  return (
    <div className="maint-banner" role="status">
      <b>صيانة</b> {s.text || 'يُجري مسؤول النظام صيانة على المركز. قد تتأخر بعض العمليات.'}
    </div>
  );
}
