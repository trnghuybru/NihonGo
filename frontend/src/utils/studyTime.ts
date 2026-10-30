export type StudyInterval = [number, number];
const dayMs = 86400000;
const vietnamOffsetMs = 7 * 3600000;

export function studyDate(now: number) {
  return new Date(now + vietnamOffsetMs).toISOString().slice(0, 10);
}

export function mergeStudyIntervals(
  intervals: StudyInterval[],
): StudyInterval[] {
  const merged: StudyInterval[] = [];
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

export function studySeconds(intervals: StudyInterval[], day: string) {
  const start = Date.parse(`${day}T00:00:00+07:00`);
  return Math.floor(
    mergeStudyIntervals(intervals).reduce(
      (total, [a, b]) =>
        total + Math.max(0, Math.min(b, start + dayMs) - Math.max(a, start)),
      0,
    ) / 1000,
  );
}

/** Short batches keep server validation and retries bounded. */
export function appendStudyInterval(
  pending: StudyInterval[],
  start: number,
  end: number,
) {
  const last = pending[pending.length - 1];
  if (last && start === last[1] && end - last[0] <= 60000) last[1] = end;
  else pending.push([start, end]);
}

export function formatStudyTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
