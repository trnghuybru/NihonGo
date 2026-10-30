import * as Keychain from 'react-native-keychain';
const service = (accountId: string) => 'com.nihongoflow.reading.' + accountId;
export const readingPreferences = {
  async load(accountId: string): Promise<boolean> {
    const saved = await Keychain.getGenericPassword({
      service: service(accountId),
    });
    return saved ? saved.password !== 'false' : true;
  },
  async save(accountId: string, show: boolean) {
    await Keychain.setGenericPassword('furigana', String(show), {
      service: service(accountId),
    });
  },
};
