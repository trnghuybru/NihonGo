export const jlptDraftStorage = {
  async read(key: string): Promise<string | null> {
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved;
    // Keep drafts made before persistent storage was introduced.
    const legacy = sessionStorage.getItem(key);
    if (legacy !== null) localStorage.setItem(key, legacy);
    return legacy;
  },
  async write(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  },
};
