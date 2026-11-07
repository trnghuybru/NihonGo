import type { CastleWord } from './data';
export type CastleSettings = {
  sound: boolean;
  music: boolean;
  effects: boolean;
  roundSeconds: 8 | 9 | 10;
};
export type CastleProgress = {
  best: Record<string, number>;
  mistakes: CastleWord[];
  settings: CastleSettings;
};
export const defaultProgress = (): CastleProgress => ({
  best: {},
  mistakes: [],
  settings: { sound: true, music: true, effects: true, roundSeconds: 9 },
});
export function decodeProgress(value: string | null): CastleProgress {
  const defaults = defaultProgress();
  try {
    const data = JSON.parse(value || '{}');
    const settings = data.settings || {};
    const best: Record<string, number> = {};
    for (const [key, n] of Object.entries(data.best || {}))
      if (
        ['N5', 'N4', 'N3', 'N2', 'N1'].includes(key) &&
        typeof n === 'number' &&
        Number.isFinite(n) &&
        n >= 0
      )
        best[key] = n;
    return {
      best,
      mistakes: Array.isArray(data.mistakes)
        ? data.mistakes
            .filter(
              (word: CastleWord) =>
                word &&
                [
                  'id',
                  'kanji',
                  'hiragana',
                  'romaji',
                  'meaning',
                  'level',
                  'category',
                ].every(
                  key =>
                    typeof (word as unknown as Record<string, unknown>)[key] ===
                    'string',
                ),
            )
            .slice(-300)
        : [],
      settings: {
        sound:
          typeof settings.sound === 'boolean'
            ? settings.sound
            : defaults.settings.sound,
        music:
          typeof settings.music === 'boolean'
            ? settings.music
            : defaults.settings.music,
        effects:
          typeof settings.effects === 'boolean'
            ? settings.effects
            : defaults.settings.effects,
        roundSeconds: [8, 9, 10].includes(settings.roundSeconds)
          ? settings.roundSeconds
          : 9,
      },
    };
  } catch {
    return defaults;
  }
}
