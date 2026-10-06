import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScenarioFilters,
  ScenarioList,
  speakingService,
} from '../services/speakingService';

export type RemoteState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Không tải được dữ liệu. Vui lòng thử lại.';
}

/** Ignore responses from an older selection or an unmounted screen. */
export function useRemoteResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<RemoteState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    load().then(
      data => {
        if (active) setState({ status: 'ready', data });
      },
      error => {
        if (active) setState({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [load, attempt]);
  return { state, reload };
}

export function useScenarioList(filters: ScenarioFilters) {
  const { category_id, level, language_code, q } = filters;
  const [state, setState] = useState<RemoteState<ScenarioList>>({
    status: 'loading',
  });
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const generation = useRef(0);
  const pending = useRef(false);
  const reload = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    const current = ++generation.current;
    pending.current = false;
    setState({ status: 'loading' });
    setLoadingMore(false);
    setMoreError('');
    speakingService.list({ category_id, level, language_code, q }).then(
      data => {
        if (generation.current === current) setState({ status: 'ready', data });
      },
      error => {
        if (generation.current === current)
          setState({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => {
      generation.current = current + 1;
    };
  }, [category_id, level, language_code, q, attempt]);

  const loadMore = useCallback(async () => {
    if (
      pending.current ||
      state.status !== 'ready' ||
      state.data.pagination.page >= state.data.pagination.total_pages
    )
      return;
    const current = generation.current;
    pending.current = true;
    setLoadingMore(true);
    setMoreError('');
    try {
      const next = await speakingService.list(
        { category_id, level, language_code, q },
        state.data.pagination.page + 1,
      );
      if (generation.current !== current) return;
      const ids = new Set(state.data.items.map(item => item.id));
      setState({
        status: 'ready',
        data: {
          items: [
            ...state.data.items,
            ...next.items.filter(item => !ids.has(item.id)),
          ],
          pagination: next.pagination,
        },
      });
    } catch (error) {
      if (generation.current === current) setMoreError(errorMessage(error));
    } finally {
      if (generation.current === current) {
        pending.current = false;
        setLoadingMore(false);
      }
    }
  }, [state, category_id, level, language_code, q]);
  return { state, reload, loadMore, loadingMore, moreError };
}
