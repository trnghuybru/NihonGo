import { CastleProgress, decodeProgress } from './progress.types';
const key = (accountId: string) => `nihongo.castle.v1.${accountId}`;
export const castleProgress = {
  async load(accountId: string) {
    return decodeProgress(localStorage.getItem(key(accountId)));
  },
  async save(accountId: string, value: CastleProgress) {
    localStorage.setItem(key(accountId), JSON.stringify(value));
  },
};
