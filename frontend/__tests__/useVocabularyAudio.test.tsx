import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useVocabularyAudio } from '../src/hooks/useVocabularyAudio';
import { AudioReplay } from '../src/services/audioReplay';
import { vocabularyService } from '../src/services/vocabularyService';

jest.mock('../src/services/audioReplay');
jest.mock('../src/services/vocabularyService', () => ({
  vocabularyService: { audioPlayback: jest.fn(), audioSynthesize: jest.fn() },
}));
let audio: ReturnType<typeof useVocabularyAudio>;
let tree: Renderer.ReactTestRenderer;
function Harness({ scope }: { scope: string }) {
  audio = useVocabularyAudio(scope);
  return null;
}
beforeEach(async () => {
  jest.clearAllMocks();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: jest.fn() }));
  jest.mocked(AudioReplay.prototype.play).mockResolvedValue(true);
  jest.mocked(AudioReplay.prototype.close).mockResolvedValue(undefined);
  jest
    .mocked(vocabularyService.audioPlayback)
    .mockResolvedValue({ url: 'signed.mp3', expires_in: 300 });
  await act(async () => {
    tree = Renderer.create(<Harness scope="lesson-1" />);
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
});

test('switching word stops old audio and completion resets only the current word', async () => {
  await act(async () => {
    await audio.toggle('one');
  });
  const firstEnd = jest.mocked(AudioReplay.prototype.play).mock.calls[0][1];
  await act(async () => {
    await audio.toggle('two');
  });
  expect(audio.wordId).toBe('two');
  await act(async () => {
    firstEnd();
  });
  expect(audio.wordId).toBe('two');
  await act(async () => {
    jest.mocked(AudioReplay.prototype.play).mock.calls[1][1]();
  });
  expect(audio.wordId).toBeNull();
});

test('a late signed URL cannot start playback after changing lesson', async () => {
  let resolve!: (value: { url: string; expires_in: number }) => void;
  jest.mocked(vocabularyService.audioPlayback).mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = audio.toggle('one');
  });
  expect(audio.loading).toBe(true);
  await act(async () => {
    tree.update(<Harness scope="lesson-2" />);
  });
  await act(async () => {
    resolve({ url: 'late.mp3', expires_in: 300 });
    await pending;
  });
  expect(AudioReplay.prototype.play).not.toHaveBeenCalled();
  expect(audio.wordId).toBeNull();
});

test('backgrounding cancels pending playback and unmount closes the player', async () => {
  const listener = jest.spyOn(AppState, 'addEventListener');
  await act(async () => {
    tree.update(<Harness scope="lesson-3" />);
  });
  await act(async () => {
    await audio.toggle('one');
  });
  const change = listener.mock.calls[0][1];
  await act(async () => {
    change('background');
  });
  expect(audio.wordId).toBeNull();
  expect(AudioReplay.prototype.stop).toHaveBeenCalled();
  await act(async () => {
    tree.unmount();
  });
  expect(AudioReplay.prototype.close).toHaveBeenCalled();
  listener.mockRestore();
});

test('plays the cached Supertonic pronunciation for a word without imported audio', async () => {
  const Tts = require('react-native-tts').default;
  await act(async () => {
    await audio.toggle('school', '学校', 'がっこう', false);
  });
  expect(vocabularyService.audioPlayback).toHaveBeenCalledWith('school');
  expect(AudioReplay.prototype.play).toHaveBeenCalledWith(
    'signed.mp3',
    expect.any(Function),
  );
  expect(Tts.speak).not.toHaveBeenCalled();
  expect(audio.loading).toBe(false);
  await act(async () => {
    await audio.toggle('school', '学校', 'がっこう', false);
  });
  expect(AudioReplay.prototype.stop).toHaveBeenCalled();
  expect(audio.wordId).toBeNull();
});

test('falls back to machine speech if original recording fails', async () => {
  const Tts = require('react-native-tts').default;
  jest
    .mocked(vocabularyService.audioPlayback)
    .mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => {
    await audio.toggle('school', '学校', 'がっこう', true);
  });
  expect(Tts.speak).toHaveBeenCalledWith('がっこう');
  expect(audio.error).toBeNull();
});

test('reports a missing Japanese voice without speaking in another language', async () => {
  const Tts = require('react-native-tts').default;
  jest.mocked(vocabularyService.audioPlayback).mockRejectedValueOnce(new Error('offline'));
  jest.mocked(vocabularyService.audioSynthesize).mockRejectedValueOnce(new Error('offline'));
  Tts.voices.mockResolvedValueOnce([{ id: 'en', language: 'en-US' }]);
  await act(async () => {
    await audio.toggle('school', '学校', 'がっこう', false);
  });
  expect(Tts.speak).not.toHaveBeenCalled();
  expect(audio.error?.message).toContain('giọng tiếng Nhật');
  expect(audio.wordId).toBeNull();
});

test('pending device initialization cannot speak after navigating away', async () => {
  const Tts = require('react-native-tts').default;
  jest.mocked(vocabularyService.audioPlayback).mockRejectedValueOnce(new Error('offline'));
  jest.mocked(vocabularyService.audioSynthesize).mockRejectedValueOnce(new Error('offline'));
  let resolve!: (value: string) => void;
  Tts.getInitStatus.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = audio.toggle('school', '学校', 'がっこう', false);
  });
  await act(async () => {
    tree.update(<Harness scope="elsewhere" />);
  });
  await act(async () => {
    resolve('success');
    await pending;
  });
  expect(Tts.speak).not.toHaveBeenCalled();
});

test('native completion only clears the matching utterance', async () => {
  const Tts = require('react-native-tts').default;
  jest.mocked(vocabularyService.audioPlayback).mockRejectedValueOnce(new Error('offline'));
  jest.mocked(vocabularyService.audioSynthesize).mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    await audio.toggle('school', '学校', 'がっこう', false);
  });
  const finish = Tts.addEventListener.mock.calls.find(
    (call: unknown[]) => call[0] === 'tts-finish',
  )[1];
  await act(async () => {
    finish({ utteranceId: 'older-utterance' });
  });
  expect(audio.wordId).toBe('school');
  await act(async () => {
    finish({ utteranceId: 'utterance' });
  });
  expect(audio.wordId).toBeNull();
});
