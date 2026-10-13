import { createContext, useContext } from 'react';

export const BottomNavigationInsetContext = createContext(0);

export function useBottomNavigationInset() {
  return useContext(BottomNavigationInsetContext);
}
