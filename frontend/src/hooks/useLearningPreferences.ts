import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LearningSelection,
  LearningState,
  learningService,
} from '../services/learningService';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: LearningState };

/** Mounted once per authenticated user; drafts remain local to the setup screen. */
export function useLearningPreferences() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setState({ status: 'loading' });
    learningService.load().then(
      data => {
        if (current === generation.current) {
          setState({ status: 'ready', data });
        }
      },
      failure => {
        if (current === generation.current) {
          setState({
            status: 'error',
            message:
              failure instanceof Error
                ? failure.message
                : 'Không tải được thiết lập học tập.',
          });
        }
      },
    );
    return () => {
      generation.current = current + 1;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt(value => value + 1), []);
  async function save(selection: LearningSelection) {
    if (state.status !== 'ready') {
      throw new Error('Vui lòng tải lại thiết lập trước khi lưu.');
    }
    const current = generation.current;
    const profile = await learningService.save(
      selection,
      state.data.profile?.version ?? 0,
    );
    if (current === generation.current) {
      setState({ status: 'ready', data: { ...state.data, profile } });
    }
  }

  return { state, reload, save };
}
