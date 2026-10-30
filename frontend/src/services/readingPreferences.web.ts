const key = (accountId: string) => 'nihongo.reading.furigana.' + accountId;
export const readingPreferences = {
  async load(accountId: string): Promise<boolean> {
    return localStorage.getItem(key(accountId)) !== 'false';
  },
  async save(accountId: string, show: boolean) {
    localStorage.setItem(key(accountId), String(show));
  },
};
