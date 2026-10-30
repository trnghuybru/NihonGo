import { flashcardDueLabel } from '../src/utils/flashcardDue';

test('short learning steps show minutes and their Vietnam due date', () => {
  const now = Date.parse('2026-10-20T16:59:30Z');
  expect(flashcardDueLabel(now + 60000, now)).toEqual({
    interval: '1 phút',
    date: '21/10',
  });
  expect(flashcardDueLabel(now + 600000, now)).toEqual({
    interval: '10 phút',
    date: '21/10',
  });
});
test('long intervals show calendar days and include the year across New Year', () => {
  const now = Date.parse('2026-12-30T12:00:00Z');
  expect(flashcardDueLabel(now + 3 * 86400000, now)).toEqual({
    interval: '3 ngày',
    date: '02/01/2027',
  });
});
