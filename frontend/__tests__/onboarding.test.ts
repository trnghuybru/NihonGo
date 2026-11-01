import {
  featureGuides,
  guideForPath,
  guideStorageKey,
  readGuideProgress,
  saveGuideProgress,
} from '../web/onboarding';

test('keeps welcome and guide progress separate for users sharing a browser', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  saveGuideProgress(storage, 'alice', { welcome: true, speaking: true });
  expect(readGuideProgress(storage, 'alice')).toEqual({
    welcome: true,
    speaking: true,
  });
  expect(readGuideProgress(storage, 'bob')).toEqual({});
});

test.each(['null', '[]', 'false', '{bad-json', '"string"'])(
  'recovers from invalid stored progress: %s',
  raw => {
    expect(readGuideProgress({ getItem: () => raw }, 'alice')).toEqual({});
  },
);

test('accepts only known guides marked explicitly complete', () => {
  expect(
    readGuideProgress(
      {
        getItem: () =>
          '{"welcome":true,"speaking":1,"reading":false,"unknown":true}',
      },
      'alice',
    ),
  ).toEqual({ welcome: true });
  expect(guideStorageKey('alice')).toContain(':v1:alice');
});

test('blocked storage never prevents access to the app', () => {
  expect(
    readGuideProgress(
      {
        getItem: () => {
          throw new Error('blocked');
        },
      },
      'alice',
    ),
  ).toEqual({});
  expect(
    saveGuideProgress(
      {
        setItem: () => {
          throw new Error('full');
        },
      },
      'alice',
      { welcome: true },
    ),
  ).toBe(false);
});

test('auto guides run at module entry and do not interrupt ongoing activities', () => {
  for (const guide of featureGuides)
    expect(guideForPath(guide.path)?.id).toBe(guide.id);
  for (const path of [
    '/practice/speaking/sessions/123',
    '/practice/speaking/new',
    '/practice/reading/123',
    '/games/ABC123',
    '/flashcards/review',
    '/onboarding',
    '/profile',
    '/games-other',
  ]) {
    expect(guideForPath(path)).toBeUndefined();
  }
});

test('listening lesson guide has independent progress across all video deep links', () => {
  expect(guideForPath('/practice/listening/video-a')?.id).toBe(
    'listening-lesson',
  );
  expect(guideForPath('/practice/listening/video-b')?.id).toBe(
    'listening-lesson',
  );
  expect(guideForPath('/practice/listening')?.id).toBe('listening');
  expect(
    readGuideProgress({ getItem: () => '{"listening":true}' }, 'alice')[
      'listening-lesson'
    ],
  ).toBeUndefined();
  expect(
    readGuideProgress({ getItem: () => '{"listening-lesson":true}' }, 'alice')[
      'listening-lesson'
    ],
  ).toBe(true);
});
