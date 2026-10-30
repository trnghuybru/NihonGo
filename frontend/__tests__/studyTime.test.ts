import {
  appendStudyInterval,
  formatStudyTime,
  mergeStudyIntervals,
  studyDate,
  studySeconds,
} from '../src/utils/studyTime';

test('unions overlapping tabs and retries, preserving gaps', () => {
  expect(
    mergeStudyIntervals([
      [5, 10],
      [0, 7],
      [0, 7],
      [20, 25],
    ]),
  ).toEqual([
    [0, 10],
    [20, 25],
  ]);
});
test('clips intervals to the Vietnamese date and keeps subsecond remainders', () => {
  const midnight = Date.parse('2026-10-19T00:00:00+07:00');
  const intervals: [number, number][] = [
    [midnight - 2000, midnight + 3000],
    [midnight + 3000, midnight + 3500],
  ];
  expect(studyDate(midnight - 1)).toBe('2026-10-18');
  expect(studyDate(midnight)).toBe('2026-10-19');
  expect(studySeconds(intervals, '2026-10-18')).toBe(2);
  expect(studySeconds(intervals, '2026-10-19')).toBe(3);
  expect(formatStudyTime(452)).toBe('07:32');
});
test('caps queued batches at one minute without merging time away from study screens', () => {
  const pending: [number, number][] = [];
  appendStudyInterval(pending, 0, 30000);
  appendStudyInterval(pending, 30000, 60000);
  appendStudyInterval(pending, 60000, 61000);
  appendStudyInterval(pending, 70000, 71000);
  expect(pending).toEqual([
    [0, 60000],
    [60000, 61000],
    [70000, 71000],
  ]);
});
