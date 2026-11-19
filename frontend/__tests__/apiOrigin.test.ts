import { resolveApiOrigin } from '../src/config/apiOrigin';

const web = 'https://momonihongo.app';
describe('web API origin', () => {
  it('keeps old same-origin builds working and normalizes the API origin', () => {
    expect(resolveApiOrigin(undefined, web)).toBe(web);
    expect(resolveApiOrigin('', web)).toBe(web);
    expect(resolveApiOrigin(' https://api.momonihongo.app/ ', web)).toBe(
      'https://api.momonihongo.app',
    );
  });
  it.each([
    'http://api.momonihongo.app',
    'https://api.momonihongo.app/api',
    'https://api.momonihongo.app/?token=secret',
    'https://api.momonihongo.app/#fragment',
    'https://user:password@api.momonihongo.app',
    'invalid',
    'wss://api.momonihongo.app',
  ])('rejects an unsafe or incorrectly scoped production value: %s', value => {
    expect(() => resolveApiOrigin(value, web)).toThrow();
  });
  it('allows HTTP only for development', () => {
    expect(resolveApiOrigin('http://localhost:5001', web, true)).toBe(
      'http://localhost:5001',
    );
  });
});
