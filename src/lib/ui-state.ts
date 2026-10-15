// The only state the shell keeps in the browser besides what the pages read from the database
// (Action_Plan.md B8): the role the interface behaves as, whether it may be switched, and the
// message the toast shows. The prototype's sample works, notices and directory that used to live
// here are gone.
import type { Role } from './domain.ts';

export type UiState = {
  /** The role the interface behaves as: the signed-in person's own, or the one an administrator views as. */
  role: Role;
  /** The signed-in person's own role. */
  baseRole: Role;
  /** True for everyone but an administrator: the role cannot be switched from the interface or by an action. */
  roleLocked: boolean;
  /** The toast text; empty when there is none. */
  message: string;
};

export type UiAction =
  | { type: 'role'; role: Role }
  | { type: 'clear' }
  | { type: 'notify'; text: string }
  | { type: 'reset' };

export function initialState(role: Role = 'director', roleLocked = false): UiState {
  return { role, baseRole: role, roleLocked, message: '' };
}

export function reducer(state: UiState, a: UiAction): UiState {
  if (a.type === 'role') {
    // The control is hidden for non-administrators; this is the rule behind it.
    if (state.roleLocked) return { ...state, message: 'تبديل الدور متاح لمسؤول النظام فقط.' };
    return { ...state, role: a.role, message: '' };
  }
  if (a.type === 'reset') return initialState(state.baseRole, state.roleLocked);
  if (a.type === 'clear') return { ...state, message: '' };
  return { ...state, message: a.text };
}
