'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { Account } from './access';

const Context = createContext<Account | null>(null);

/** The signed-in person. Only rendered once the server has confirmed an approved account. */
export function AccountProvider({ account, children }: { account: Account; children: ReactNode }) {
  return <Context.Provider value={account}>{children}</Context.Provider>;
}

export function useAccount(): Account {
  const value = useContext(Context);
  if (!value) throw Error('Account provider missing');
  return value;
}
