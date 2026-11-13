import { createContext, useContext } from 'react';

/** True when rendered under `/tv/*` — full screen, unattended, no sidebar. */
export const KioskContext = createContext(false);

export function useIsKiosk(): boolean {
  return useContext(KioskContext);
}
