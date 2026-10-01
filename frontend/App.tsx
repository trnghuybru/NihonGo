import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginScreen } from './src/screens/LoginScreen';
import { AuthenticatedScreen } from './src/screens/AuthenticatedScreen';
import { AuthButton, AuthNotice, AuthShell } from './src/components/AuthForm';
import { authService, User } from './src/services/authService';
import { StartupSplash } from './src/components/StartupSplash';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startupFinished, setStartupFinished] = useState(false);
  const finishStartup = useCallback(() => setStartupFinished(true), []);
  const restore = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUser(await authService.restore());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Không khôi phục được phiên đăng nhập.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const unsubscribe = authService.subscribe(setUser);
    restore();
    return unsubscribe;
  }, [restore]);

  return (
    <SafeAreaProvider>
      {!startupFinished ? (
        <StartupSplash ready={!loading} onFinished={finishStartup} />
      ) : loading || error ? (
        <AuthShell
          title="NihonGO"
          subtitle="Đang khôi phục phiên đăng nhập của bạn."
        >
          <AuthNotice message={error} error />
          <AuthButton
            label="Thử lại"
            busy={loading}
            onPress={() => {
              restore();
            }}
          />
        </AuthShell>
      ) : user ? (
        <AuthenticatedScreen key={user.id} user={user} />
      ) : (
        <LoginScreen />
      )}
    </SafeAreaProvider>
  );
}

export default App;
