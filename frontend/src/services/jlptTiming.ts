import type { Exam } from './jlptService';

export type ExamMode = 'practice' | 'timed';
export type ExamTiming = {
  section: number;
  phase: 'running' | 'between' | 'complete';
  deadlineAt: number | null;
};
export function startTiming(exam: Exam, now = Date.now()): ExamTiming {
  const seconds = exam.sections[0]?.duration_seconds;
  if (!seconds || seconds <= 0)
    throw new Error('Đề này chưa có thời lượng đã xác minh.');
  return { section: 0, phase: 'running', deadlineAt: now + seconds * 1000 };
}
export function settleTiming(
  exam: Exam,
  timing: ExamTiming,
  now = Date.now(),
): ExamTiming {
  if (
    timing.phase !== 'running' ||
    timing.deadlineAt === null ||
    now < timing.deadlineAt
  )
    return timing;
  return {
    section: timing.section,
    phase: timing.section === exam.sections.length - 1 ? 'complete' : 'between',
    deadlineAt: null,
  };
}
export function nextTiming(
  exam: Exam,
  timing: ExamTiming,
  now = Date.now(),
): ExamTiming {
  const index = timing.section + 1;
  if (timing.phase !== 'between' || !exam.sections[index])
    throw new Error('Chưa thể bắt đầu phần tiếp theo.');
  if (exam.sections[index].id === 'listening' && !exam.audio_url)
    throw new Error('Chưa có tệp nghe cho phần thi này.');
  const seconds = exam.sections[index].duration_seconds;
  if (!seconds) throw new Error('Chưa có thời lượng của phần thi.');
  return { section: index, phase: 'running', deadlineAt: now + seconds * 1000 };
}
export function canAnswer(
  exam: Exam,
  timing: ExamTiming,
  questionId: string,
  now = Date.now(),
): boolean {
  return (
    timing.phase === 'running' &&
    timing.deadlineAt !== null &&
    now < timing.deadlineAt &&
    exam.sections[timing.section]?.questions.some(q => q.id === questionId)
  );
}
