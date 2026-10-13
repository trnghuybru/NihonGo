import { useEffect, useMemo, useRef, useState } from 'react';
import {
  shadowingService,
  ShadowingQuestion,
  ShadowingQuizLevel,
} from '../services/shadowingService';

export function useShadowingQuiz(jobId: string | undefined) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<ShadowingQuestion[]>([]);
  const [level, setLevel] = useState<ShadowingQuizLevel>('N3');
  const [generatedLevel, setGeneratedLevel] =
    useState<ShadowingQuizLevel>('N3');
  const [enabled, setEnabled] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const completed = useMemo(() => Object.keys(answers), [answers]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const choice = activeId ? answers[activeId] ?? null : null;
  const score = questions.filter(q => answers[q.id] === q.correct_index).length;
  const [resumeRequest, setResumeRequest] = useState(0);
  const [jumpRequest, setJumpRequest] = useState<{
    id: string;
    request: number;
  } | null>(null);
  const generation = useRef(0);
  const requesting = useRef(false);
  useEffect(() => {
    generation.current += 1;
    requesting.current = false;
    setSetupOpen(false);
    setLoading(false);
    setError('');
    setQuestions([]);
    setAnswers({});
    setEnabled(true);
    setActiveId(null);
    setResumeRequest(0);
    setJumpRequest(null);
    return () => {
      generation.current += 1;
      requesting.current = false;
    };
  }, [jobId]);
  const activeQuestion = questions.find(question => question.id === activeId);
  const checkpoints = useMemo(
    () =>
      (enabled ? questions : [])
        .filter(question => !completed.includes(question.id))
        .map(question => ({
          id: question.id,
          seconds: question.trigger_seconds,
        })),
    [questions, completed, enabled],
  );
  const generate = async (requestedCount: number, onStarted: () => void) => {
    if (!jobId || requesting.current) return;
    requesting.current = true;
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = await shadowingService.questions(
        jobId,
        requestedCount,
        level,
      );
      if (current !== generation.current) return;
      setQuestions(result.questions);
      setAnswers({});
      setGeneratedLevel(level);
      setEnabled(true);
      setActiveId(null);
      setJumpRequest(null);
      setSetupOpen(false);
      onStarted();
      setResumeRequest(value => value + 1);
    } catch (failure) {
      if (current === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Không tạo được câu hỏi. Vui lòng thử lại.',
        );
    } finally {
      if (current === generation.current) {
        requesting.current = false;
        setLoading(false);
      }
    }
  };
  const stop = () => {
    generation.current += 1;
    requesting.current = false;
    setLoading(false);
    setEnabled(false);
    setActiveId(null);
    setJumpRequest(null);
    setError('');
    setSetupOpen(false);
    setResumeRequest(value => value + 1);
  };
  const closeSetup = () => {
    // Cancelling also invalidates any in-flight generation result.
    generation.current += 1;
    requesting.current = false;
    setLoading(false);
    setSetupOpen(false);
    setError('');
    setResumeRequest(value => value + 1);
  };
  const showQuestion = (id: string) => {
    if (activeId || completed.includes(id) || !questions.some(q => q.id === id))
      return;
    setActiveId(id);
  };
  const jumpToQuestion = (id: string) => {
    if (loading || completed.includes(id) || !questions.some(q => q.id === id))
      return;
    setSetupOpen(false);
    setEnabled(true);
    setJumpRequest(previous => ({ id, request: (previous?.request ?? 0) + 1 }));
  };
  const reviewQuestion = (id: string) => {
    if (loading || answers[id] === undefined) return;
    setSetupOpen(false);
    setActiveId(id);
  };
  const answer = (index: number) => {
    if (!activeQuestion || choice !== null) return;
    setAnswers(previous =>
      previous[activeQuestion.id] === undefined
        ? { ...previous, [activeQuestion.id]: index }
        : previous,
    );
  };
  const continueVideo = () => {
    if (!activeQuestion || choice === null) return;
    setActiveId(null);
    setResumeRequest(value => value + 1);
  };
  return {
    setupOpen,
    setSetupOpen,
    closeSetup,
    count,
    setCount,
    level,
    setLevel,
    generatedLevel,
    enabled,
    setEnabled,
    answers,
    loading,
    error,
    questions,
    completed,
    activeQuestion,
    choice,
    score,
    checkpoints,
    resumeRequest,
    jumpRequest,
    jumpToQuestion,
    reviewQuestion,
    generate,
    stop,
    showQuestion,
    answer,
    continueVideo,
    paused: setupOpen || loading || Boolean(activeQuestion),
  };
}
