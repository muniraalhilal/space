'use client';
import { createContext, useContext } from 'react';

const OrgIdContext = createContext<string | null>(null);
export const OrgIdProvider = OrgIdContext.Provider;

export function useOrgId(): string {
  const id = useContext(OrgIdContext);
  if (!id) throw new Error('useOrgId must be used inside an organisation route');
  return id;
}
