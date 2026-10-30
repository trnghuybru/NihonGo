import { useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router';
import {
  WebNavigationContext,
  selectedTabForPath,
} from '../src/navigation/webNavigation';
function NavigationBridge({ children }: { children: ReactNode }) {
  const location = useLocation(),
    navigate = useNavigate();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  useEffect(() => {
    if (pathname !== location.pathname)
      navigate(pathname + location.search, {
        replace: true,
        state: location.state,
      });
    const titles: Record<string, string> = {
      home: 'Trang chủ',
      practice: 'Luyện tập',
      lookup: 'Tra cứu',
      vocabulary: 'Bài học',
      profile: 'Cá nhân',
    };
    const feature = pathname.startsWith('/flashcards')
      ? 'Flashcard'
      : pathname.startsWith('/games')
      ? 'Game từ vựng'
      : pathname === '/login'
      ? 'Đăng nhập'
      : pathname === '/register'
      ? 'Đăng ký'
      : pathname === '/forgot-password'
      ? 'Quên mật khẩu'
      : titles[selectedTabForPath(pathname)];
    document.title = feature + ' · NihonGO';
  }, [location, pathname, navigate]);
  const go = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigate(to, options);
    },
    [navigate],
  );
  const back = useCallback(
    (fallback: string) => {
      if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
      else navigate(fallback, { replace: true });
    },
    [navigate],
  );
  const value = useMemo(
    () => ({
      pathname,
      search: location.search,
      key: location.key,
      state: location.state,
      navigate: go,
      back,
    }),
    [location, pathname, go, back],
  );
  return (
    <WebNavigationContext.Provider value={value}>
      {children}
    </WebNavigationContext.Provider>
  );
}
export function WebRouter({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <NavigationBridge>{children}</NavigationBridge>
    </BrowserRouter>
  );
}
