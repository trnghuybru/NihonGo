import { onlineManager } from '@tanstack/react-query';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useRemoteResource } from '../src/hooks/useSpeakingScenarios';
import {
  learningQueryClient,
  setLearningCacheAccount,
} from '../src/services/learningCache';

const trees: Renderer.ReactTestRenderer[] = [];
test('a request paused while offline resumes after reconnecting', async () => {
  onlineManager.setOnline(false);
  const load = jest.fn().mockResolvedValue('reconnected words');
  try {
    const resource = await mount(load);
    expect(load).not.toHaveBeenCalled();
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(resource.states.at(-1)).toBe('reconnected words');
  } finally {
    onlineManager.setOnline(true);
  }
});
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 15));
  });
}
async function mount(load: () => Promise<string>, selection = 'N5') {
  const states: string[] = [];
  let reload = () => {};
  function Screen({ level }: { level: string }) {
    const resource = useRemoteResource(load, ['test-lessons', level]);
    reload = resource.reload;
    states.push(
      resource.state.status === 'ready'
        ? resource.state.data
        : resource.state.status,
    );
    return null;
  }
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<Screen level={selection} />);
  });
  trees.push(tree);
  await settle();
  return {
    states,
    reload: () => reload(),
    update: async (level: string) => {
      await act(async () => {
        tree.update(<Screen level={level} />);
      });
      await settle();
    },
  };
}
afterEach(async () => {
  await act(async () => {
    trees.splice(0).forEach(tree => tree.unmount());
  });
  setLearningCacheAccount(null);
  learningQueryClient.clear();
});

test('returning to a level and remounting reuse fresh data; simultaneous requests deduplicate', async () => {
  const load = jest
    .fn()
    .mockResolvedValueOnce('N5 words')
    .mockResolvedValueOnce('N4 words');
  const first = await mount(load);
  await first.update('N4');
  await first.update('N5');
  expect(first.states.at(-1)).toBe('N5 words');
  const second = await mount(load);
  expect(second.states).toEqual(['N5 words']);
  expect(load).toHaveBeenCalledTimes(2);
  let resolve!: (value: string) => void;
  const slow = jest.fn(
    () =>
      new Promise<string>(done => {
        resolve = done;
      }),
  );
  const a = await mount(slow, 'N3');
  const b = await mount(slow, 'N3');
  expect(slow).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve('N3 words');
  });
  await settle();
  expect(a.states.at(-1)).toBe('N3 words');
  expect(b.states.at(-1)).toBe('N3 words');
});

test('stale background refresh and failed retry retain readable content', async () => {
  const load = jest
    .fn()
    .mockResolvedValueOnce('cached words')
    .mockRejectedValue(new Error('offline'));
  const resource = await mount(load);
  await act(async () => {
    await learningQueryClient.invalidateQueries({
      queryKey: ['learning-content'],
    });
  });
  await settle();
  expect(load).toHaveBeenCalledTimes(2);
  expect(resource.states.at(-1)).toBe('cached words');
  await act(async () => {
    resource.reload();
  });
  await settle();
  expect(load).toHaveBeenCalledTimes(3);
  expect(resource.states.at(-1)).toBe('cached words');
});

test('switching accounts discards content and late responses from the previous account', async () => {
  setLearningCacheAccount('alice');
  let resolve!: (value: string) => void;
  const load = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<string>(done => {
          resolve = done;
        }),
    )
    .mockResolvedValue('bob words');
  const resource = await mount(load);
  await act(async () => {
    setLearningCacheAccount('bob');
  });
  await settle();
  await act(async () => {
    resolve('alice words');
  });
  await settle();
  expect(resource.states.at(-1)).toBe('bob words');
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => {
    setLearningCacheAccount('bob');
  });
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => {
    setLearningCacheAccount(null);
  });
  await settle();
  expect(load).toHaveBeenCalledTimes(3);
});
