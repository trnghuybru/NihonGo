import { createContext, useContext } from 'react';
export const DESKTOP_SIDEBAR_WIDTH = 240;
export const WebLayoutContext = createContext({
  desktop: false,
  contentWidth: 0,
});
export function useWebLayout() {
  return useContext(WebLayoutContext);
}
