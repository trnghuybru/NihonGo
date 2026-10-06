import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConversationMessage,
  TurnInput,
  speakingService,
} from '../services/speakingService';
import { errorMessage } from './useSpeakingScenarios';
import { ApiError } from '../services/apiClient';

// Correlation identifiers are not authentication secrets. Ownership is checked server-side.
function requestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value % 4) + 8).toString(16);
  });
}

export function useConversation(sessionId: string) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(true);
  const [retryUntil, setRetryUntil] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const pending = useRef<TurnInput | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    if (!retryUntil) {
      setRetrySeconds(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((retryUntil - Date.now()) / 1000),
      );
      setRetrySeconds(remaining);
      if (!remaining) setRetryUntil(0);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);

  const reload = useCallback(
    async (waitForReply = false) => {
      const current = ++generation.current;
      setLoading(true);
      setError('');
      try {
        const deadline = Date.now() + 30000;
        while (true) {
          const items: ConversationMessage[] = [];
          let after = 0;
          while (true) {
            const page = await speakingService.messages(sessionId, after);
            if (!mounted.current || current !== generation.current) return;
            items.push(...page.items);
            setActive(page.session.status === 'active');
            if (!page.has_more) break;
            if (page.next_sequence <= after)
              throw new Error('Không tải được transcript.');
            after = page.next_sequence;
          }
          setMessages(items);
          setReady(true);
          const user = items.find(
            item => item.id === pending.current?.request_id,
          );
          const assistant = user
            ? items.find(
                item =>
                  item.sequence_number === user.sequence_number + 1 &&
                  item.speaker === 'assistant',
              )
            : undefined;
          if (assistant?.status === 'completed') {
            pending.current = null;
            setRetryUntil(0);
            return assistant;
          }
          // The server can still be finishing the reserved turn after a lost POST.
          // Poll only the saved transcript, never resubmit the learner's message.
          if (
            !waitForReply ||
            assistant?.status !== 'pending' ||
            Date.now() >= deadline
          )
            return;
          await new Promise<void>(resolve => setTimeout(resolve, 1000));
          if (!mounted.current || current !== generation.current) return;
        }
      } catch (failure) {
        if (mounted.current && current === generation.current)
          setError(errorMessage(failure));
      } finally {
        if (mounted.current && current === generation.current)
          setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [reload]);

  const send = async (
    content: string,
    inputMode: 'text' | 'voice',
    retry = false,
  ) => {
    if (busy.current || loading || !ready || !active || Date.now() < retryUntil)
      return false;
    const latest = messages.at(-1);
    let values = pending.current;
    if (
      retry &&
      !values &&
      latest?.speaker === 'assistant' &&
      latest.status !== 'completed'
    ) {
      const user = messages.find(
        item =>
          item.sequence_number === latest.sequence_number - 1 &&
          item.speaker === 'user',
      );
      if (user)
        values = {
          request_id: user.id,
          content: user.content,
          input_mode: user.input_mode === 'voice' ? 'voice' : 'text',
        };
    }
    if (!retry) {
      if (
        values ||
        (latest?.speaker === 'assistant' && latest.status !== 'completed')
      )
        return false;
      values = {
        request_id: requestId(),
        content: content.trim(),
        input_mode: inputMode,
      };
    }
    if (!values || !values.content) return false;
    pending.current = values;
    busy.current = true;
    setSending(true);
    setError('');
    try {
      const reply = await speakingService.send(sessionId, values);
      if (!mounted.current) return false;
      generation.current += 1;
      setMessages(previous => {
        const byId = new Map(previous.map(item => [item.id, item]));
        byId.set(reply.user_message.id, reply.user_message);
        byId.set(reply.assistant_message.id, reply.assistant_message);
        return [...byId.values()].sort(
          (a, b) => a.sequence_number - b.sequence_number,
        );
      });
      pending.current = null;
      setRetryUntil(0);
      return reply.assistant_message;
    } catch (failure) {
      if (!mounted.current) return false;
      const limited = failure instanceof ApiError && failure.status === 429;
      const recovered = await reload(!limited);
      if (recovered) return recovered;
      if (!mounted.current) return false;
      if (limited) {
        const seconds = Math.max(1, Math.min(failure.retryAfter || 30, 300));
        setRetrySeconds(seconds);
        setRetryUntil(Date.now() + seconds * 1000);
      }
      if (mounted.current) setError(errorMessage(failure));
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setSending(false);
    }
  };
  const unresolved =
    Boolean(pending.current) ||
    Boolean(messages.at(-1)?.status !== 'completed' && messages.length);
  return {
    messages,
    loading,
    ready,
    sending,
    error,
    active,
    retrySeconds,
    unresolved,
    reload,
    send,
  };
}
