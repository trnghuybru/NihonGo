import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Animated, AppState, View } from 'react-native';
import { Path } from 'react-native-svg';
import { KanjiStrokeDiagram } from '../src/components/KanjiStrokeDiagram';

jest.mock('react-native-svg', () => {
  const actual = jest.requireActual('react-native-svg');
  class MeasuredPath extends actual.Path {
    getTotalLength = () => 100;
  }
  return { __esModule: true, ...actual, Path: MeasuredPath };
});

let tree: Renderer.ReactTestRenderer;
const paths = ['M10,20 L30,40', 'M40,20 L60,40'];
function control(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}
async function press(label: string) {
  await act(async () => control(label).props.onPress());
}
async function advance(ms: number) {
  await act(async () => jest.advanceTimersByTime(ms));
}
function offsets() {
  return tree.root
    .findAllByType(Path)
    .filter(node => node.props.testID?.startsWith('kanji-animated-stroke-'))
    .map(node => Number(node.props.strokeDashoffset));
}
async function measure() {
  await act(async () => {
    tree.root
      .findAllByType(View)
      .find(node => node.props.onLayout)
      ?.props.onLayout();
  });
}
beforeEach(async () => {
  jest.useFakeTimers();
  await act(async () => {
    tree = Renderer.create(<KanjiStrokeDiagram paths={paths} />);
  });
  await measure();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('automatically writes strokes in order and has only a replay control', async () => {
  const buttons = tree.root.findAll(
    node =>
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityRole === 'button',
  );
  expect(new Set(buttons.map(node => node.props.accessibilityLabel))).toEqual(
    new Set(['Phát lại nét viết']),
  );
  await advance(320);
  expect(offsets()[0]).toBeGreaterThan(0);
  expect(offsets()[0]).toBeLessThan(100);
  expect(offsets()[1]).toBe(100);
  await advance(1600);
  expect(offsets()).toEqual([0, 0]);
  await press('Phát lại nét viết');
  expect(offsets()).toEqual([100, 100]);
  await advance(300);
  await press('Phát lại nét viết');
  expect(offsets()).toEqual([100, 100]);
  await advance(1800);
  expect(offsets()).toEqual([0, 0]);
});

test('changing characters resets playback and unmount stops animation', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  await press('Phát lại nét viết');
  await advance(300);
  const stop = jest.spyOn(timing.mock.results[0].value, 'stop');
  await act(async () =>
    tree.update(<KanjiStrokeDiagram paths={['M20,20 L40,50']} />),
  );
  expect(stop).toHaveBeenCalled();
  await measure();
  expect(offsets()).toEqual([100]);
  const stopSecond = jest.spyOn(timing.mock.results[1].value, 'stop');
  await act(async () => tree.unmount());
  expect(stopSecond).toHaveBeenCalled();
});

test('stops drawing when the app goes into the background', async () => {
  await act(async () => tree.unmount());
  const listen = jest.spyOn(AppState, 'addEventListener');
  await act(async () => {
    tree = Renderer.create(<KanjiStrokeDiagram paths={paths} />);
  });
  await measure();
  await advance(200);
  await act(async () =>
    listen.mock.calls[listen.mock.calls.length - 1][1]('background'),
  );
  const paused = offsets();
  await advance(500);
  expect(offsets()).toEqual(paused);
});
