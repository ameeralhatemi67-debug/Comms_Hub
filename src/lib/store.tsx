'use client';
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Role } from './domain';
import { initialState, reducer, type UiState, type UiAction } from './ui-state';

const Context = createContext<{ state: UiState; dispatch: Dispatch<UiAction> } | null>(null);

/**
 * `role` is the signed-in person's own role. `roleLocked` is true for everyone but an
 * administrator, so the role cannot be switched from the interface or by an action.
 */
export function Store({
  children,
  role = 'director',
  roleLocked = false,
}: {
  children: ReactNode;
  role?: Role;
  roleLocked?: boolean;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(role, roleLocked));
  return <Context.Provider value={{ state, dispatch }}>{children}</Context.Provider>;
}

export function useHub() {
  const value = useContext(Context);
  if (!value) throw Error('Hub provider missing');
  return value;
}
