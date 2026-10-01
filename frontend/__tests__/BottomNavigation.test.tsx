import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { APP_TABS, BottomNavigation } from '../src/components/BottomNavigation';

let tree: Renderer.ReactTestRenderer;
afterEach(async () => {
  await act(async () => tree?.unmount());
});

test('exposes four accessible tabs and only one selected destination', async () => {
  const onSelectTab = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <BottomNavigation selectedTab="home" onSelectTab={onSelectTab} />,
    );
  });
  const tabs = APP_TABS.map(
    tab =>
      tree.root.findAll(
        node =>
          node.props.accessibilityRole === 'tab' &&
          node.props.accessibilityLabel === tab.label &&
          typeof node.props.onPress === 'function',
      )[0],
  );
  expect(tabs).toHaveLength(4);
  expect(tabs.map(node => node.props.accessibilityLabel)).toEqual(
    APP_TABS.map(tab => tab.label),
  );
  expect(
    tabs.filter(node => node.props.accessibilityState.selected),
  ).toHaveLength(1);
  expect(tabs[0].props.accessibilityState.selected).toBe(true);
  await act(async () => tabs[2].props.onPress());
  expect(onSelectTab).toHaveBeenCalledWith('practice');
});

test('moves selected semantics with controlled state', async () => {
  await act(async () => {
    tree = Renderer.create(
      <BottomNavigation selectedTab="profile" onSelectTab={jest.fn()} />,
    );
  });
  const tabs = APP_TABS.map(
    tab =>
      tree.root.findAll(
        node =>
          node.props.accessibilityRole === 'tab' &&
          node.props.accessibilityLabel === tab.label &&
          typeof node.props.onPress === 'function',
      )[0],
  );
  expect(tabs[3].props.accessibilityState.selected).toBe(true);
  expect(tabs[0].props.accessibilityState.selected).toBe(false);
});
