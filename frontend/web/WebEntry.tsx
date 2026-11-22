import { lazy, Suspense } from 'react';
import { Navigate, useLocation } from 'react-router';
import LandingPage from './landing/LandingPage';

// Keep the learning app and its media/voice dependencies out of the public entry.
const LearningApp = lazy(() => import('../App'));
function hasSavedSession() {
  try {
    return Boolean(
      sessionStorage.getItem('nihongo.web.v1.com.nihongoflow.auth.session'),
    );
  } catch {
    return false;
  }
}
export function WebEntry() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/landing') {
    return <Navigate replace to={'/' + location.search + location.hash} />;
  }
  if (pathname === '/') {
    return <LandingPage hasSession={hasSavedSession()} />;
  }
  return (
    <Suspense
      fallback={
        <div role="status" className="ml-app-loading">
          Đang mở NihonGO…
        </div>
      }
    >
      <LearningApp />
    </Suspense>
  );
}
