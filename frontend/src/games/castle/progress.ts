import * as Keychain from 'react-native-keychain';
import { CastleProgress, decodeProgress } from './progress.types';
export const castleProgress = {
  async load(accountId: string) {
    const value = await Keychain.getGenericPassword({
      service: `com.nihongo.castle.${accountId}`,
    });
    return decodeProgress(value ? value.password : null);
  },
  async save(accountId: string, value: CastleProgress) {
    await Keychain.setGenericPassword('progress', JSON.stringify(value), {
      service: `com.nihongo.castle.${accountId}`,
    });
  },
};
