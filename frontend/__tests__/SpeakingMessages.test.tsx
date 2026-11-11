import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { SpeakingMessages } from '../src/components/SpeakingMessages';
import { initialPresentation } from '../src/hooks/useSpeakingPresentation';
import type { ConversationMessage } from '../src/services/speakingService';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    ActivityIndicator: 'ActivityIndicator',
    Platform: {
      OS: 'web',
      select: (values: Record<string, unknown>) => values.web ?? values.default,
    },
    FlatList: ({ data, renderItem, ListHeaderComponent, ListFooterComponent }: {
      data: unknown[];
      renderItem: (info: { item: unknown }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      ListFooterComponent?: React.ReactNode;
    }) =>
      React.createElement(
        'FlatList',
        null,
        ListHeaderComponent,
        data.map((item, index) =>
          React.createElement(React.Fragment, { key: index }, renderItem({ item })),
        ),
        ListFooterComponent,
      ),
    Pressable: ({ children, onPress, ...props }: {
      children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
      onPress?: () => void;
      [key: string]: unknown;
    }) =>
      React.createElement(
        'Pressable',
        { ...props, onPress },
        typeof children === 'function' ? children({ pressed: false }) : children,
      ),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: 'Text',
    View: 'View',
  };
});
jest.mock('../src/components/icons', () => ({
  VolumeIcon: () => null,
  VolumeXIcon: () => null,
}));
jest.mock('../src/components/MessageFeedback', () => ({
  MessageFeedback: () => null,
}));
jest.mock('../src/components/HomeFeatureIcon', () => ({
  HomeFeatureIcon: () => null,
}));

const userMessage: ConversationMessage = {
  id: 'user-message-1',
  sequence_number: 2,
  speaker: 'user',
  input_mode: 'voice',
  content: 'こんにちは',
  status: 'completed',
  occurred_at: '2026-11-11T00:00:00Z',
};

test('shows a replay control for the current local microphone recording', async () => {
  const toggleLocal = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <SpeakingMessages
        messages={[userMessage]}
        presentation={{ ...initialPresentation, phase: 'user_turn' }}
        replay={{
          messageId: null,
          loading: false,
          disabled: false,
          toggle: jest.fn(),
          toggleLocal,
          localAudioUrls: { [userMessage.id]: 'blob:local-utterance' },
        }}
      />,
    );
  });
  const button = tree.root.findByProps({
    accessibilityLabel: 'Nghe lại giọng của bạn',
  });
  await act(async () => button.props.onPress());
  expect(toggleLocal).toHaveBeenCalledWith(
    userMessage.id,
    'blob:local-utterance',
  );
});
