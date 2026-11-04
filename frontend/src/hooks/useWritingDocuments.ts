import { useCallback, useEffect, useRef, useState } from 'react';
import { writingService } from '../services/writingService';
import type { WritingDraft, WritingPrompt } from '../services/writingService';

export type WritingDocument = {
  key: string;
  title: string;
  level: string;
  prompt?: WritingPrompt;
  draftId?: string;
  text: string;
  savedText: string;
  error?: string;
  pending?: Promise<boolean>;
};
export type OpenWritingDocument = Omit<
  WritingDocument,
  'savedText' | 'pending' | 'error'
> & { savedText?: string };

export function useWritingDocuments(
  onSaved: (draft: WritingDraft) => void,
  paused = false,
) {
  const documents = useRef(new Map<string, WritingDocument>());
  const activeKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const [, refresh] = useState(0);
  const notify = useCallback(() => {
    if (mounted.current) refresh(value => value + 1);
  }, []);

  const saveDocument = useCallback(
    (key: string): Promise<boolean> => {
      const document = documents.current.get(key);
      if (!document) return Promise.resolve(true);
      if (document.pending) return document.pending;
      if (document.text.trim() === document.savedText)
        return Promise.resolve(true);
      if (document.text.trim().length < 4) return Promise.resolve(false);
      document.error = undefined;
      const operation = Promise.resolve().then(async () => {
        try {
          // A response updates metadata, never the text being edited. If typing
          // continued during the request, save the latest snapshot next.
          while (
            document.text.trim() !== document.savedText &&
            document.text.trim().length >= 4
          ) {
            const snapshot = document.text.trim();
            const result = document.draftId
              ? await writingService.updateDraft(document.draftId, snapshot)
              : document.prompt
              ? await writingService.saveDraft(document.prompt.id, snapshot)
              : await writingService.saveCustomDraft(snapshot, document.title);
            document.draftId = result.draft.id;
            document.savedText = snapshot;
            if (mounted.current) onSaved(result.draft);
          }
          return document.text.trim() === document.savedText;
        } catch (error) {
          document.error =
            error instanceof Error
              ? error.message
              : 'Chưa lưu được bản nháp. Hãy thử lại.';
          return false;
        } finally {
          document.pending = undefined;
          notify();
        }
      });
      document.pending = operation;
      notify();
      return operation;
    },
    [notify, onSaved],
  );

  const open = useCallback(
    (input: OpenWritingDocument) => {
      if (activeKey.current) saveDocument(activeKey.current);
      // A new custom draft keeps its client key while it is being saved. Reuse
      // that buffer when it is opened later from the server's draft list.
      const cached = input.draftId
        ? Array.from(documents.current.values()).find(
            item => item.draftId === input.draftId,
          )
        : documents.current.get(input.key);
      const key = cached?.key ?? input.key;
      if (!cached)
        documents.current.set(key, {
          ...input,
          savedText: input.savedText ?? input.text.trim(),
        });
      activeKey.current = key;
      notify();
    },
    [notify, saveDocument],
  );

  const setText = useCallback(
    (text: string) => {
      const document = activeKey.current
        ? documents.current.get(activeKey.current)
        : undefined;
      if (!document) return;
      document.text = text;
      document.error = undefined;
      notify();
    },
    [notify],
  );

  const forget = useCallback(
    (draftId: string) => {
      for (const document of documents.current.values()) {
        if (document.draftId === draftId) {
          documents.current.delete(document.key);
          if (activeKey.current === document.key) activeKey.current = null;
        }
      }
      notify();
    },
    [notify],
  );

  const active = activeKey.current
    ? documents.current.get(activeKey.current)
    : undefined;
  const text = active?.text;
  const key = active?.key;
  useEffect(() => {
    const current = key ? documents.current.get(key) : undefined;
    if (
      paused ||
      !key ||
      !current ||
      current.text.trim() === current.savedText ||
      current.text.trim().length < 4
    )
      return;
    const timer = setTimeout(() => {
      saveDocument(key);
    }, 1500);
    return () => clearTimeout(timer);
    // Only text/document changes restart the debounce; a failed save must not
    // trigger an automatic retry loop.
  }, [key, text, saveDocument, paused]);

  useEffect(() => {
    mounted.current = true;
    const entries = documents.current;
    return () => {
      mounted.current = false;
      for (const document of entries.values()) saveDocument(document.key);
    };
  }, [saveDocument]);

  const save = useCallback(
    () =>
      activeKey.current
        ? saveDocument(activeKey.current)
        : Promise.resolve(false),
    [saveDocument],
  );
  return {
    active,
    open,
    setText,
    save,
    forget,
    busy: Array.from(documents.current.values()).some(item =>
      Boolean(item.pending),
    ),
  };
}
