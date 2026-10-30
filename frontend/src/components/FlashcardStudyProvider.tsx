import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import {
  flashcardSrsService,
  subscribeFlashcardSchedule,
} from '../services/flashcardSrsService';
import type {
  FlashcardSchedule,
  ReminderPreference,
} from '../services/flashcardSrsService';
import {
  requestReminderPermission,
  setReminderAccount,
  subscribeReminderPress,
  syncFlashcardReminders,
} from '../services/flashcardNotifications';

type StudyContext = {
  data: FlashcardSchedule | null;
  error: string;
  notificationError: string;
  reload: () => void;
  saveReminder: (preference: ReminderPreference) => Promise<void>;
};
const Context = createContext<StudyContext | null>(null);
export const useFlashcardStudy = () => useContext(Context);

export function FlashcardStudyProvider({
  accountId,
  onOpenDue,
  children,
}: {
  accountId: string;
  onOpenDue: () => void;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<FlashcardSchedule | null>(null);
  const [error, setError] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const generation = useRef(0);
  const alive = useRef(true);
  const openDue = useRef(onOpenDue);
  openDue.current = onOpenDue;
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await flashcardSrsService.schedule();
      if (!alive.current || current !== generation.current) return;
      setData(result);
      setError('');
      try {
        await syncFlashcardReminders(result, accountId);
        if (alive.current && current === generation.current)
          setNotificationError('');
      } catch (failure) {
        if (alive.current && current === generation.current)
          setNotificationError(
            failure instanceof Error
              ? failure.message
              : 'Chưa hẹn được thông báo ôn tập.',
          );
      }
    } catch (failure) {
      if (alive.current && current === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Không tải được lịch ôn.',
        );
    }
  }, [accountId]);
  const reload = useCallback(() => {
    refresh();
  }, [refresh]);
  const nextDueAt = data?.next_due_at;
  useEffect(() => {
    if (!nextDueAt || nextDueAt <= Date.now()) return;
    const timer = setTimeout(() => {
      if (
        AppState.currentState === 'active' &&
        (Platform.OS !== 'web' || document.visibilityState === 'visible')
      )
        reload();
    }, Math.min(nextDueAt - Date.now() + 250, 2147483647));
    return () => clearTimeout(timer);
  }, [nextDueAt, reload]);
  useEffect(() => {
    alive.current = true;
    setReminderAccount(accountId).catch(() => {
      if (alive.current)
        setNotificationError('Chưa cập nhật được thông báo trên thiết bị.');
    });
    reload();
    const unsubscribe = subscribeFlashcardSchedule(reload);
    const press = subscribeReminderPress(accountId, () => openDue.current());
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') reload();
    });
    const timer = setInterval(() => {
      if (
        AppState.currentState === 'active' &&
        (Platform.OS !== 'web' || document.visibilityState === 'visible')
      )
        reload();
    }, 60000);
    if (Platform.OS === 'web') window.addEventListener('focus', reload);
    return () => {
      alive.current = false;
      generation.current += 1;
      unsubscribe();
      press();
      listener.remove();
      clearInterval(timer);
      if (Platform.OS === 'web') window.removeEventListener('focus', reload);
    };
  }, [accountId, reload]);
  const saveReminder = async (preference: ReminderPreference) => {
    if (preference.enabled) await requestReminderPermission();
    await flashcardSrsService.reminder(preference);
    await refresh();
  };
  return (
    <Context.Provider
      value={{ data, error, notificationError, reload, saveReminder }}
    >
      {children}
    </Context.Provider>
  );
}
