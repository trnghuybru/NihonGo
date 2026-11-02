import { useEffect, useMemo, useRef, useState } from 'react';
import {
  shadowingService,
  ShadowingQuestion,
  ShadowingQuizLevel,
} from '../services/shadowingService';

export function useShadowingQuiz(jobId: string | undefined) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<ShadowingQuestion[]>([]);
  const [level, setLevelState] = useState<ShadowingQuizLevel>('N3');
  const [availableLevels, setAvailableLevels] = useState<ShadowingQuizLevel[]>(
    [],
  );
  const savedSets = useRef<
    Record<
      string,
      { questions: ShadowingQuestion[]; answers: Record<string, number> }
    >
  >({});
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
    savedSets.current = {};
    setAvailableLevels([]);
    setSetupOpen(false);
    setResumeRequest(0);
  }, [jobId]);
  useEffect(() => {
    const current = ++generation.current;
    requesting.current = false;
    setError('');
    setQuestions([]);
    setAnswers({});
    setEnabled(true);
    setActiveId(null);
    setJumpRequest(null);
    setGeneratedLevel(level);
    const saved = savedSets.current[level];
    setLoading(Boolean(jobId && !saved));
    if (saved) {
      setQuestions(saved.questions);
      setAnswers(saved.answers);
    } else if (jobId) {
      shadowingService
        .savedQuestions(jobId, level)
        .then(result => {
          if (current !== generation.current) return;
          if (Array.isArray(result?.available_levels))
            setAvailableLevels(result.available_levels);
          if (
            !Array.isArray(result?.questions) ||
            (result.level && result.level !== level)
          )
            return;
          setQuestions(result.questions);
          if (result.questions.length)
            savedSets.current[level] = {
              questions: result.questions,
              answers: {},
            };
        })
        .catch(() => {
          // Cache lookup never automatically generates paid questions.
        })
        .finally(() => {
          if (current === generation.current) setLoading(false);
        });
    }
    return () => {
      generation.current += 1;
      requesting.current = false;
    };
  }, [jobId, level]);
  const setLevel = (next: ShadowingQuizLevel) => {
    if (next === level) return;
    if (questions.length) savedSets.current[level] = { questions, answers };
    generation.current += 1;
    setLevelState(next);
  };
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
  const generate = async (onStarted: () => void) => {
    if (!jobId || requesting.current) return;
    requesting.current = true;
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = questions.length
        ? { questions, level: generatedLevel }
        : await shadowingService.questions(jobId, level);
      if (current !== generation.current) return;
      if (
        !Array.isArray(result?.questions) ||
        (result.level && result.level !== level)
      ) {
        throw new Error('Dữ liệu câu hỏi chưa hợp lệ. Vui lòng thử lại.');
      }
      setQuestions(result.questions);
      setAnswers({});
      savedSets.current[level] = { questions: result.questions, answers: {} };
      setAvailableLevels(previous => [...new Set([...previous, level])]);
      setGeneratedLevel(result.level ?? level);
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
    if (
      !enabled ||
      setupOpen ||
      loading ||
      activeId ||
      completed.includes(id) ||
      !questions.some(q => q.id === id)
    )
      return;
    setActiveId(current => current ?? id);
  };
  const onPlaybackTime = (seconds: number) => {
    if (
      !Number.isFinite(seconds) ||
      seconds < 0 ||
      !enabled ||
      setupOpen ||
      loading ||
      activeId
    )
      return;
    if (jumpRequest && !completed.includes(jumpRequest.id)) {
      const target = questions.find(question => question.id === jumpRequest.id);
      if (target && Math.abs(seconds - target.trigger_seconds) <= 0.35)
        showQuestion(target.id);
      return;
    }
    const due = questions.find(
      question =>
        !completed.includes(question.id) && seconds >= question.trigger_seconds,
    );
    if (due) showQuestion(due.id);
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
    level,
    setLevel,
    generatedLevel,
    availableLevels,
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
    onPlaybackTime,
    answer,
    continueVideo,
    paused: setupOpen || loading || Boolean(activeQuestion),
  };
}
