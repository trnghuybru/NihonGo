import { authenticatedRequest } from './authService';
import { notifyFlashcardScheduleChanged } from './flashcardSrsService';

export type DeckKind = 'lesson' | 'custom' | 'favorites';
export type DeckRef = { kind: DeckKind; id: string };
export type Flashcard = {
  srs_id?: string;
  id: string;
  front: string;
  reading: string;
  back: string;
};
export type FlashcardDeck = DeckRef & {
  title: string;
  subtitle: string;
  card_count: number;
};
export type FlashcardSession = {
  id: string;
  kind: DeckKind;
  deck_id: string;
  title: string;
  cards: Flashcard[];
  ratings: Record<string, number>;
  rating_options?: { grade: number; due_at: number }[];
  started_at: number;
  finished_at: number | null;
  summary: {
    total: number;
    studied: number;
    counts: number[];
    remembered: number;
    remembered_percent: number;
  };
};
export type DeckCatalog = {
  items: FlashcardDeck[];
  pagination: { page: number; total_pages: number };
  active_session: {
    id: string;
    title: string;
    studied: number;
    total: number;
  } | null;
};
export type CustomDeck = { id: string; title: string; cards: Flashcard[] };
export type CardDraft = Pick<Flashcard, 'front' | 'reading' | 'back'>;
const root = '/flashcards';
export const flashcardService = {
  decks: (kind: DeckKind, level: string, page = 1) =>
    authenticatedRequest<DeckCatalog>(
      `${root}/decks?kind=${kind}&level=${level}&page=${page}`,
    ),
  deck: (id: string) =>
    authenticatedRequest<CustomDeck>(`${root}/decks/${encodeURIComponent(id)}`),
  saveDeck: async (title: string, cards: CardDraft[], id?: string) => {
    const result = await authenticatedRequest<CustomDeck>(
      `${root}/decks${id ? `/${encodeURIComponent(id)}` : ''}`,
      { title, cards },
      id ? 'PUT' : 'POST',
    );
    notifyFlashcardScheduleChanged();
    return result;
  },
  favorite: (source: 'lesson' | 'dictionary', id: string) =>
    authenticatedRequest<{ saved: boolean }>(
      `${root}/favorites/${source}/${encodeURIComponent(id)}`,
    ),
  addDictionaryCard: async (deckId: string, dictionaryId: string) => {
    const result = await authenticatedRequest<{
      added: boolean;
      deck_id: string;
      title: string;
      card: Flashcard;
    }>(
      `${root}/decks/${encodeURIComponent(deckId)}/cards`,
      { dictionary_id: dictionaryId },
      'POST',
    );
    notifyFlashcardScheduleChanged();
    return result;
  },
  setFavorite: (source: 'lesson' | 'dictionary', id: string, saved: boolean) =>
    authenticatedRequest<{ saved: boolean }>(
      `${root}/favorites/${source}/${encodeURIComponent(id)}`,
      undefined,
      saved ? 'PUT' : 'DELETE',
    ),
  start: (deck: DeckRef) =>
    authenticatedRequest<FlashcardSession>(`${root}/sessions`, {
      kind: deck.kind,
      deck_id: deck.id,
    }),
  sessionFavorite: (sessionId: string, cardId: string) =>
    authenticatedRequest<{ saved: boolean }>(
      `${root}/sessions/${encodeURIComponent(
        sessionId,
      )}/favorite/${encodeURIComponent(cardId)}`,
    ),
  setSessionFavorite: async (
    sessionId: string,
    cardId: string,
    saved: boolean,
  ) => {
    const result = await authenticatedRequest<{ saved: boolean }>(
      `${root}/sessions/${encodeURIComponent(
        sessionId,
      )}/favorite/${encodeURIComponent(cardId)}`,
      undefined,
      saved ? 'PUT' : 'DELETE',
    );
    notifyFlashcardScheduleChanged();
    return result;
  },
  session: (id: string) =>
    authenticatedRequest<FlashcardSession>(
      `${root}/sessions/${encodeURIComponent(id)}`,
    ),
  rate: async (id: string, cardId: string, grade: number) => {
    const result = await authenticatedRequest<FlashcardSession>(
      `${root}/sessions/${encodeURIComponent(id)}/rate`,
      { card_id: cardId, grade },
    );
    notifyFlashcardScheduleChanged();
    return result;
  },
  finish: (id: string) =>
    authenticatedRequest<FlashcardSession>(
      `${root}/sessions/${encodeURIComponent(id)}/finish`,
      {},
      'POST',
    ),
};
