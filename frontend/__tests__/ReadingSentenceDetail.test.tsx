import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ReadingSentenceDetail } from '../src/components/ReadingSentenceDetail';
import {
  ReadingSentenceAnalysis,
  ReadingSentenceRole,
} from '../src/services/readingService';
const modifier = '難しい顔をして勉強することがよいことだと思っていた';
const original = modifier + '私は、いつも不思議だった。';
let cursor = 0;
const segments = (
  [
    [modifier, 'modifier', false, '私を修飾する mệnh đề bổ nghĩa cho 私.'],
    ['私は、', 'subject', true, 'Chủ thể của vị ngữ cuối câu.'],
    ['いつも', 'adjunct', true, 'Giữ ý nghĩa tần suất luôn luôn.'],
    ['不思議だった。', 'predicate', true, 'Vị ngữ chính của câu.'],
  ] as [string, ReadingSentenceRole, boolean, string][]
).map(([text, role, is_core, explanation], index) => {
  const start = cursor;
  cursor += text.length;
  return {
    id: 'p' + index,
    text,
    role,
    is_core,
    explanation,
    location: {
      sentence_id: 's1',
      paragraph_id: '0',
      quote: text,
      start,
      end: cursor,
    },
  };
});
const detail: ReadingSentenceAnalysis = {
  sentence_id: 's1',
  original,
  main_idea: 'Tôi luôn cảm thấy lạ.',
  translation_vi:
    'Tôi, vốn từng nghĩ việc học với vẻ nghiêm nghị là tốt, luôn cảm thấy lạ.',
  core_text: '私は、いつも不思議だった。',
  core_translation_vi: 'Tôi luôn cảm thấy lạ.',
  implicit_subject: '',
  segments,
  core: { subject: '私は、', predicate: '不思議だった。', object: '' },
  layers: [],
  parts: [],
  caution: '',
};
let tree: Renderer.ReactTestRenderer;
const focus = jest.fn();
function control(label: string, role = 'button') {
  return tree.root.findAll(
    n =>
      n.props.accessibilityLabel === label &&
      n.props.accessibilityRole === role &&
      typeof n.props.onPress === 'function',
  )[0];
}
async function press(label: string, role = 'button') {
  await act(async () => control(label, role).props.onPress());
}
function screenText() {
  return tree.root
    .findAllByType(Text)
    .map(n => n.props.children)
    .flat()
    .join(' ');
}
beforeEach(async () => {
  jest.clearAllMocks();
  await act(async () => {
    tree = Renderer.create(
      <ReadingSentenceDetail detail={detail} onFocus={focus} />,
    );
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
});
test('starts with only the main frame and a collapsed modifier, retaining essential frequency', () => {
  expect(control('Mở bổ nghĩa')).toBeDefined();
  expect(screenText()).not.toContain(modifier);
  expect(screenText()).toContain('私は、');
  expect(screenText()).toContain('いつも');
  expect(screenText()).toContain('不思議だった。');
  expect(screenText()).toContain(detail.core_translation_vi);
  expect(screenText()).not.toContain(detail.translation_vi);
});
test('opening the final collapsed component shows the corresponding full meaning', async () => {
  await press('Mở bổ nghĩa');
  expect(screenText()).toContain(modifier);
  expect(screenText()).toContain('Bổ nghĩa');
  expect(screenText()).not.toContain(segments[0].explanation);
  expect(screenText()).toContain(detail.translation_vi);
  expect(screenText()).not.toContain(detail.core_translation_vi);
  expect(focus).toHaveBeenCalledWith(segments[0].location);
  await press('Bổ nghĩa: ' + modifier);
  expect(screenText()).not.toContain(modifier);
});
test('one full-sentence action replaces the tabs and switches meaning with collapse state', async () => {
  expect(
    tree.root.findAll(n => n.props.accessibilityRole === 'tab'),
  ).toHaveLength(0);
  await press('Đầy đủ câu');
  expect(screenText()).toContain(modifier);
  expect(screenText()).toContain(detail.translation_vi);
  await press('Chủ thể: 私は、');
  expect(screenText()).not.toContain(segments[1].explanation);
  await press('Thu gọn câu');
  expect(screenText()).not.toContain(modifier);
  expect(screenText()).toContain(detail.core_translation_vi);
  expect(screenText()).not.toContain(detail.translation_vi);
  await press('Vị ngữ: 不思議だった。');
  expect(screenText()).not.toContain(detail.translation_vi);
});
test('all segments reconstruct the original without invented or dropped characters', () => {
  expect(segments.map(segment => segment.text).join('')).toBe(original);
  for (let i = 1; i < segments.length; i++)
    expect(segments[i].location.start).toBe(segments[i - 1].location.end);
});
