import { authenticatedRequest } from '../src/services/authService';
import {
  dictionaryService,
  DictionaryHistoryItem,
} from '../src/services/dictionaryService';

jest.mock('../src/services/authService', () => ({
  authenticatedRequest: jest.fn(),
}));
const item: DictionaryHistoryItem = {
  kind: 'word',
  target: 'jmdict:1',
  word: '学校',
  reading: 'がっこう',
  glosses: [],
  viewed_at: 1,
};
afterEach(() => jest.clearAllMocks());

test('records and clears history with the correct methods and notifies active views', async () => {
  jest
    .mocked(authenticatedRequest)
    .mockResolvedValueOnce({ items: [item] })
    .mockResolvedValueOnce({ items: [] });
  const listener = jest.fn();
  const unsubscribe = dictionaryService.subscribeHistory(listener);
  try {
    await dictionaryService.recordHistory('word', item.target);
    expect(authenticatedRequest).toHaveBeenCalledWith(
      '/dictionary/history',
      { kind: 'word', target: item.target },
      'POST',
    );
    expect(listener).toHaveBeenLastCalledWith([item]);
    await dictionaryService.clearHistory();
    expect(authenticatedRequest).toHaveBeenLastCalledWith(
      '/dictionary/history',
      undefined,
      'DELETE',
    );
    expect(listener).toHaveBeenLastCalledWith([]);
  } finally {
    unsubscribe();
  }
});

test('an old in-flight write cannot expose history to a newly mounted account view', async () => {
  let resolve!: (result: { items: DictionaryHistoryItem[] }) => void;
  jest.mocked(authenticatedRequest).mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  const oldAccount = jest.fn();
  const unsubscribeOld = dictionaryService.subscribeHistory(oldAccount);
  const pending = dictionaryService.recordHistory('word', item.target);
  unsubscribeOld();
  const newAccount = jest.fn();
  const unsubscribeNew = dictionaryService.subscribeHistory(newAccount);
  try {
    resolve({ items: [item] });
    await pending;
    expect(oldAccount).not.toHaveBeenCalled();
    expect(newAccount).not.toHaveBeenCalled();
  } finally {
    unsubscribeNew();
  }
});
