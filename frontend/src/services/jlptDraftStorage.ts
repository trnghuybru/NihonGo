import * as Keychain from 'react-native-keychain';

export const jlptDraftStorage = {
  async read(key: string): Promise<string | null> {
    const saved = await Keychain.getGenericPassword({ service: key });
    return saved ? saved.password : null;
  },
  async write(key: string, value: string): Promise<void> {
    const saved = await Keychain.setGenericPassword('exam-draft', value, {
      service: key,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (!saved) throw new Error('Không lưu được bài làm trên thiết bị.');
  },
};
