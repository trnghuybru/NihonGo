import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StudyStreakCalendar } from '../src/components/StudyStreakCalendar';
import { studyTimeService } from '../src/services/studyTimeService';
import { studyDate } from '../src/utils/studyTime';

jest.mock('../src/services/studyTimeService', () => ({
  studyTimeService: { calendar: jest.fn() },
}));

test('shows recorded study days and navigates between calendar years', async () => {
  const today = studyDate(Date.now());
  const year = Number(today.slice(0, 4));
  jest.mocked(studyTimeService.calendar).mockImplementation(async (_, requestedYear) => ({
    year: requestedYear,
    today,
    timezone: 'Asia/Ho_Chi_Minh',
    goal_seconds: 900,
    first_year: year - 1,
    days: requestedYear === year ? [{ date: today, seconds: 900 }] : [],
    study_days: requestedYear === year ? 1 : 0,
    current_streak: 1,
    longest_streak: 1,
  }));
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<StudyStreakCalendar accountId="alice" />);
  });
  expect(tree.root.findByProps({ testID: 'study-streak-calendar' })).toBeDefined();
  expect(JSON.stringify(tree.toJSON())).toContain('Lịch học');
  expect(JSON.stringify(tree.toJSON())).toContain('Chuỗi dài nhất');
  const back = tree.root.findAll(
    node => node.props.accessibilityLabel === 'Năm trước' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => back.props.onPress());
  expect(studyTimeService.calendar).toHaveBeenLastCalledWith('alice', year - 1);
  await act(async () => tree.unmount());
});
