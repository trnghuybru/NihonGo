import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { Polygon } from 'react-native-svg';
import { WritingRadarChart } from '../src/components/WritingRadarChart';
import {
  WritingAssessmentView,
  writingCorrectionSegments,
} from '../src/components/WritingAssessmentView';
import type { WritingAssessment } from '../src/services/writingService';

const original = '😊学校を行きます。日本語が好き。';
const corrected = '😊学校に行きます。日本語が好きです。';
const report: WritingAssessment = {
  version: 1,
  level: 'N5',
  next_step: 'Viết hai câu với に.',
  criteria: ['task', 'organization', 'grammar', 'vocabulary'].map(
    (id, index) => ({
      id,
      title: [
        'Đáp ứng đề bài',
        'Tổ chức và liên kết',
        'Ngữ pháp',
        'Từ vựng và chính tả',
      ][index],
      score: 20,
      comment: 'Nhận xét theo yêu cầu N5.',
      subcriteria: [
        { id: 'accuracy', title: 'Độ chính xác ngữ pháp', score: 4 },
      ],
    }),
  ),
  corrections: [
    {
      start: 1,
      end: 8,
      original: '学校を行きます',
      replacement: '学校に行きます',
      criterion_id: 'grammar',
      kind: 'error',
      explanation: 'Dùng に để chỉ nơi đến.',
    },
    {
      start: 9,
      end: 16,
      original: '日本語が好き。',
      replacement: '日本語が好きです。',
      criterion_id: 'grammar',
      kind: 'suggestion',
      explanation: 'Có thể dùng です để thống nhất cách nói lịch sự.',
    },
  ],
};
let tree: Renderer.ReactTestRenderer;
afterEach(async () => {
  await act(async () => tree?.unmount());
});
function button(label: string) {
  return tree.root.find(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
}
function text() {
  return tree.root
    .findAllByType(Text)
    .map(node => String(node.props.children ?? ''))
    .join('\n');
}
async function render(assessment: WritingAssessment | null = report) {
  await act(async () => {
    tree = Renderer.create(
      <WritingAssessmentView
        text={original}
        correctedText={corrected}
        feedback="Nhận xét đã lưu"
        assessment={assessment}
      />,
    );
  });
}

test('renders exact Unicode anchors and reconstructs the corrected essay', () => {
  const segments = writingCorrectionSegments(original, report.corrections);
  expect(segments).not.toBeNull();
  expect(
    segments!.map(item => item.correction?.replacement ?? item.text).join(''),
  ).toBe(corrected);
  expect(
    writingCorrectionSegments(original, [
      { ...report.corrections[0], start: 2 },
    ]),
  ).toBeNull();
});

test('selects correction explanations and switches original/corrected views', async () => {
  await render();
  expect(text()).toContain('Dùng に để chỉ nơi đến.');
  await act(async () => button('Chỗ sửa 2').props.onPress());
  expect(text()).toContain('Có thể dùng です');
  expect(text()).toContain('Gợi ý diễn đạt');
  await act(async () => button('Bản gốc').props.onPress());
  expect(
    tree.root.findByProps({ testID: 'writing-review-text' }).props.children,
  ).toBe(original);
  await act(async () => button('Đã sửa').props.onPress());
  expect(
    tree.root.findByProps({ testID: 'writing-review-text' }).props.children,
  ).toBe(corrected);
  await act(async () => button('Tiêu chí Ngữ pháp').props.onPress());
  expect(text()).toContain('Độ chính xác ngữ pháp');
});

test('shows saved legacy feedback without inventing rubric scores', async () => {
  await render(null);
  expect(text()).toContain('Nhận xét đã lưu');
  expect(text()).toContain('Bài này chưa có điểm theo tiêu chí');
  expect(text()).not.toContain('/25');
});

test('keeps correct text readable when there are no corrections', async () => {
  await render({ ...report, corrections: [] });
  expect(text()).toContain('Không có gợi ý sửa cụ thể');
  expect(
    tree.root
      .findByProps({ testID: 'writing-review-text' })
      .props.children.join(''),
  ).toBe(original);
});

test('radar uses fixed criterion axes and a fixed 25-point scale', async () => {
  const criteria = report.criteria
    .map((item, index) => ({ ...item, score: [25, 0, 10, 20][index] }))
    .reverse();
  await act(async () => {
    tree = Renderer.create(<WritingRadarChart criteria={criteria} />);
  });
  const plot = tree.root
    .findAllByType(Polygon)
    .find(node => node.props.fillOpacity === 0.2)!;
  const points = plot.props.points
    .split(' ')
    .map((pair: string) => pair.split(',').map(Number));
  expect(points[0][1]).toBeCloseTo(64); // task 25/25, top
  expect(points[1][0]).toBeCloseTo(160); // organization 0/25, centre
  expect(points[2][1]).toBeCloseTo(170.4); // grammar 10/25, bottom
  expect(points[3][0]).toBeCloseTo(99.2); // vocabulary 20/25, left
});
