'use client';
// May this person create a work, as the role they are viewing? Every place that offers «إنشاء» asks here, so none can
// disagree with the page (MVP_draft.md section 70). The database decides in the end: work_create asks for the permission.
import { useAccount } from '@/lib/account-context';
import { mayCreate } from '@/lib/access';
import type { Role } from '@/lib/domain';
import { useHub } from '@/lib/store';
import { useCaps } from './caps';

export function useCanCreate(): boolean {
  const account = useAccount();
  const { state } = useHub();
  const caps = useCaps();
  return mayCreate(account, state.role, caps.has('page.create'), caps.creators ? (r: Role) => caps.creators!.includes(r) : undefined);
}
