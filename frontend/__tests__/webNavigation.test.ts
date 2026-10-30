import {
  decodeRouteParam,
  navigationLink,
  safeReturnTo,
  selectedTabForPath,
  WebNavigation,
} from '../src/navigation/webNavigation';

test('preserves internal deep links and query parameters after login', () => {
  expect(safeReturnTo('/games/ABC234')).toBe('/games/ABC234');
  expect(safeReturnTo('/lessons/lesson-1?level=N5')).toBe(
    '/lessons/lesson-1?level=N5',
  );
});
test.each([
  'https://example.com',
  '//example.com',
  '/\\example.com',
  '/login',
  '/login/',
  '/register?returnTo=/login',
  '/onboarding',
  '/onboarding/',
  '/profile\n',
  // eslint-disable-next-line no-script-url -- untrusted redirect input
  'javascript:alert(1)',
  null,
])('rejects unsafe or recursive returnTo: %s', value => {
  expect(safeReturnTo(value)).toBe('/');
});
test('selects the parent navigation tab for nested routes', () => {
  expect(selectedTabForPath('/flashcards/sessions/s1')).toBe('practice');
  expect(selectedTabForPath('/games/ABC234')).toBe('practice');
  expect(selectedTabForPath('/lessons/l1')).toBe('vocabulary');
  expect(selectedTabForPath('/lookup/kanji/学')).toBe('lookup');
  expect(selectedTabForPath('/profile/learning')).toBe('profile');
  expect(selectedTabForPath('/games-other')).toBe('home');
});
test('decodes Japanese parameters without crashing on malformed URLs', () => {
  expect(decodeRouteParam('%E5%AD%A6')).toBe('学');
  expect(decodeRouteParam('%ZZ')).toBe('%ZZ');
});
test('uses anchors on web and preserves modified clicks for new tabs', () => {
  const action = jest.fn(),
    preventDefault = jest.fn();
  const nav: WebNavigation = {
    pathname: '/',
    search: '',
    key: 'k',
    state: null,
    navigate: jest.fn(),
    back: jest.fn(),
  };
  const link = navigationLink(nav, '/flashcards', action);
  expect(link).toHaveProperty('href', '/flashcards');
  link.onPress({ ctrlKey: true, preventDefault });
  expect(action).not.toHaveBeenCalled();
  expect(preventDefault).not.toHaveBeenCalled();
  link.onPress({ preventDefault });
  expect(action).toHaveBeenCalledTimes(1);
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(navigationLink(null, '/flashcards', action)).not.toHaveProperty(
    'href',
  );
});
