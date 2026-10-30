import { studyDate } from './studyTime';

export function flashcardDueTime(dueAt: number) {
  return new Date(dueAt + 7 * 3600000).toISOString().slice(11, 16);
}

/** Calendar days and dates match the backend's Vietnam study day. */
export function flashcardDueLabel(dueAt: number, now = Date.now()) {
  const minutes = Math.max(1, Math.ceil((dueAt - now) / 60000));
  const date = studyDate(dueAt);
  const today = studyDate(now);
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  const interval =
    minutes < 60
      ? `${minutes} phút`
      : days <= 0
      ? `${Math.max(1, Math.round(minutes / 60))} giờ`
      : `${days} ngày`;
  const calendar = `${date.slice(8)}/${date.slice(5, 7)}${
    date.slice(0, 4) !== today.slice(0, 4) ? `/${date.slice(0, 4)}` : ''
  }`;
  return { interval, date: calendar };
}
