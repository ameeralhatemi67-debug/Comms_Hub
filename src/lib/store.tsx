'use client';
import {createContext,useContext,useReducer,type Dispatch,type ReactNode} from 'react';
import {initialState,reducer,type State,type Action} from './domain';
const Context=createContext<{state:State;dispatch:Dispatch<Action>}|null>(null);
export function Store({children}:{children:ReactNode}){const [state,dispatch]=useReducer(reducer,undefined,initialState);return <Context.Provider value={{state,dispatch}}>{children}</Context.Provider>}
export function useHub(){const value=useContext(Context);if(!value)throw Error('Hub provider missing');return value}
