import { useEffect, useReducer } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { LiveState } from '../services/geminiLiveService';

export type SpeakingPhase =
  | 'idle'
  | 'ai_speaking'
  | 'transition_to_user'
  | 'user_turn'
  | 'user_speaking'
  | 'processing'
  | 'error';
export interface SpeakingPresentation {
  phase: SpeakingPhase;
  transport: LiveState;
  playback: 'playing' | 'stopped';
  user: string;
  assistant: string;
  revealed: number;
  micLevel: number;
  error: string;
  motion: 'reduced' | 'full';
}
export type PresentationEvent =
  | { type: 'transport'; value: LiveState }
  | { type: 'playback'; value: boolean }
  | { type: 'transcript'; user: string; assistant: string }
  | { type: 'error'; message: string }
  | { type: 'mic_level'; level: number }
  | { type: 'tick' }
  | { type: 'transition_finished' }
  | { type: 'motion'; reduced: boolean };
export const initialPresentation: SpeakingPresentation = {
  phase: 'idle',
  transport: 'idle',
  playback: 'stopped',
  user: '',
  assistant: '',
  micLevel: 0,
  revealed: 0,
  error: '',
  motion: 'reduced',
};
const length = (text: string) => Array.from(text).length;
export function speakingPresentationReducer(
  state: SpeakingPresentation,
  event: PresentationEvent,
): SpeakingPresentation {
  switch (event.type) {
    case 'mic_level':
      return state.phase === 'user_speaking'
        ? { ...state, micLevel: Math.max(0, Math.min(1, event.level)) }
        : state;
    case 'motion':
      return { ...state, motion: event.reduced ? 'reduced' : 'full' };
    case 'error':
      return {
        ...state,
        phase: 'error',
        micLevel: 0,
        playback: 'stopped',
        error: event.message,
      };
    case 'transport': {
      const next = { ...state, transport: event.value, micLevel: 0 };
      if (event.value === 'error')
        return { ...next, phase: 'error', playback: 'stopped' };
      if (event.value === 'connecting' || event.value === 'idle')
        return { ...next, phase: 'idle', playback: 'stopped', error: '' };
      if (event.value === 'listening')
        return {
          ...next,
          phase: 'user_speaking',
          user: '',
          assistant: '',
          revealed: 0,
          error: '',
        };
      if (event.value === 'ready') {
        if (state.playback === 'playing')
          return { ...next, phase: 'ai_speaking', error: '' };
        return {
          ...next,
          phase:
            state.phase === 'ai_speaking' || state.phase === 'processing'
              ? 'transition_to_user'
              : state.phase === 'transition_to_user'
              ? state.phase
              : 'user_turn',
          revealed: length(state.assistant),
          error: '',
        };
      }
      return {
        ...next,
        phase: state.playback === 'playing' ? 'ai_speaking' : 'processing',
        error: '',
      };
    }
    case 'playback': {
      if (state.phase === 'error') return state;
      if (event.value)
        return { ...state, playback: 'playing', phase: 'ai_speaking' };
      const next = { ...state, playback: 'stopped' as const };
      if (state.phase !== 'ai_speaking') return next;
      return {
        ...next,
        phase:
          state.transport === 'ready' ? 'transition_to_user' : 'ai_speaking',
        revealed:
          state.transport === 'ready'
            ? length(state.assistant)
            : state.revealed,
      };
    }
    case 'transcript': {
      // Service clears transient text after saving; retain it through the hand-off.
      if (!event.user && !event.assistant && state.phase !== 'user_speaking')
        return state;
      const newTurn =
        state.phase === 'user_turn' || state.phase === 'transition_to_user';
      return {
        ...state,
        user: event.user,
        assistant: event.assistant,
        revealed: newTurn
          ? 0
          : Math.min(state.revealed || 1, length(event.assistant)),
      };
    }
    case 'tick':
      return state.phase === 'ai_speaking'
        ? {
            ...state,
            revealed: Math.min(state.revealed + 1, length(state.assistant)),
          }
        : state;
    case 'transition_finished':
      return state.phase === 'transition_to_user'
        ? { ...state, phase: 'user_turn' }
        : state;
  }
}
export function useSpeakingPresentation() {
  const [presentation, dispatch] = useReducer(
    speakingPresentationReducer,
    initialPresentation,
  );
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (mounted) dispatch({ type: 'motion', reduced: value });
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      reduced => dispatch({ type: 'motion', reduced }),
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (presentation.phase !== 'transition_to_user') return;
    const timer = setTimeout(
      () => dispatch({ type: 'transition_finished' }),
      380,
    );
    return () => clearTimeout(timer);
  }, [presentation.phase]);
  return { presentation, dispatch };
}
