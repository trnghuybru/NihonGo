jest.mock('../src/components/CharacterView3D', () => ({
  CharacterView3D: () => null,
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AuthenticatedScreen } from '../src/screens/AuthenticatedScreen';
import { AccountScreen } from '../src/screens/AccountScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { LearningPlanScreen } from '../src/screens/LearningPlanScreen';
import { LearningSetupScreen } from '../src/screens/LearningSetupScreen';
import { AuthButton } from '../src/components/AuthForm';
import { learningService } from '../src/services/learningService';
import { options, profile } from '../test-support/learning';
import { PracticeScreen } from '../src/screens/PracticeScreen';
import { LearningAreaScreen } from '../src/screens/LearningAreaScreen';
import { SpeakingScenariosScreen } from '../src/screens/SpeakingScenariosScreen';
import { speakingService } from '../src/services/speakingService';

jest.mock('../src/services/speakingService', () => ({
  speakingService: {
    history: jest.fn().mockResolvedValue({
      items: [],
      pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
    }),
    categories: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue({
      items: [],
      pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
    }),
    detail: jest.fn(),
    start: jest.fn(),
  },
}));

jest.mock('../src/services/learningService', () => ({
  learningService: { load: jest.fn(), save: jest.fn() },
}));
jest.mock('../src/services/authService', () => ({
  authService: { logout: jest.fn() },
}));
jest.mock('../src/screens/VoiceChatScreen', () => ({
  VoiceChatScreen: () => null,
}));
const user = {
  id: 'u1',
  name: 'Minh',
  email: 'minh@example.com',
  phone: '+84912345678',
  email_verified: true,
  phone_verified: false,
};
let tree: Renderer.ReactTestRenderer;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await act(async () => tree?.unmount());
});
async function render() {
  await act(async () => {
    tree = Renderer.create(<AuthenticatedScreen user={user} />);
  });
}
function tab(label: string) {
  return tree.root.findAll(
    node =>
      node.props.accessibilityRole === 'tab' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
}

test('opens first-use setup and enters the home tab only after saving', async () => {
  jest
    .mocked(learningService.load)
    .mockResolvedValue({ options, profile: null });
  jest.mocked(learningService.save).mockResolvedValue(profile);
  await render();
  expect(tree.root.findAllByType(AccountScreen)).toHaveLength(0);
  await act(async () => {
    await tree.root
      .findByType(LearningSetupScreen)
      .props.onSave({ level: 'N5', goal: 'communication', daily_minutes: 15 });
  });
  expect(learningService.save).toHaveBeenCalledWith(
    { level: 'N5', goal: 'communication', daily_minutes: 15 },
    0,
  );
  expect(tree.root.findByType(HomeScreen).props.profile).toEqual(profile);
});

test('loads persisted settings and cancels edits without mutating the saved profile', async () => {
  jest.mocked(learningService.load).mockResolvedValue({ options, profile });
  await render();
  await act(async () =>
    tree.root.findByType(HomeScreen).props.onContinueLearning(),
  );
  await act(async () =>
    tree.root.findByType(LearningPlanScreen).props.onEdit(),
  );
  expect(tree.root.findByType(LearningSetupScreen).props.profile).toEqual(
    profile,
  );
  await act(async () =>
    tree.root.findByType(LearningSetupScreen).props.onCancel(),
  );
  expect(tree.root.findByType(LearningPlanScreen).props.profile).toEqual(
    profile,
  );
  expect(learningService.save).not.toHaveBeenCalled();
});

test('navigates between the four real destinations', async () => {
  jest.mocked(learningService.load).mockResolvedValue({ options, profile });
  await render();
  expect(tree.root.findAllByType(HomeScreen)).toHaveLength(1);
  await act(async () => tab('Luyện tập').props.onPress());
  expect(tree.root.findAllByType(PracticeScreen)).toHaveLength(1);
  await act(async () => tab('Từ vựng').props.onPress());
  expect(tree.root.findByType(LearningAreaScreen).props.area).toBe(
    'vocabulary',
  );
  await act(async () => tab('Cá nhân').props.onPress());
  expect(tree.root.findByType(AccountScreen).props.learningProfile).toEqual(
    profile,
  );
  await act(async () => tab('Trang chủ').props.onPress());
  expect(tree.root.findAllByType(HomeScreen)).toHaveLength(1);
});

test('opens the API-connected speaking screen from the home skill card', async () => {
  jest.mocked(learningService.load).mockResolvedValue({ options, profile });
  await render();
  await act(async () =>
    tree.root.findByType(HomeScreen).props.onOpenSkill('speaking'),
  );
  expect(tree.root.findAllByType(SpeakingScenariosScreen)).toHaveLength(1);
  expect(speakingService.categories).toHaveBeenCalledTimes(1);
  expect(speakingService.list).toHaveBeenCalledTimes(1);
});

test('network errors do not masquerade as missing settings; retries load the saved profile', async () => {
  jest
    .mocked(learningService.load)
    .mockRejectedValueOnce(new Error('Không có mạng'))
    .mockResolvedValueOnce({ options, profile });
  await render();
  expect(tree.root.findAllByType(LearningSetupScreen)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Không có mạng');
  await act(async () =>
    tree.root
      .findAllByType(AuthButton)
      .find(node => node.props.label === 'Thử lại')!
      .props.onPress(),
  );
  expect(tree.root.findByType(HomeScreen).props.profile).toEqual(profile);
});
