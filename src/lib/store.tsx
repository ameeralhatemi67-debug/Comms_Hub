'use client';
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { initialState, reducer, type Role, type State, type Action } from './domain';

const Context = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null);

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
