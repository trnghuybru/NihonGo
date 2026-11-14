export type CastleWord = {
  id: string;
  kanji: string;
  hiragana: string;
  romaji: string;
  meaning: string;
  level: string;
  category: string;
};
export type QuestionKind = 'reading' | 'kanji' | 'meaning' | 'reverse';
export type CastleQuestion = {
  id: number;
  word: CastleWord;
  kind: QuestionKind;
  prompt: string;
  reading?: string;
  instruction: string;
  options: string[];
  correct: number;
};

const kana: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  を: 'wo',
  ん: 'n',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ゔ: 'vu',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
};
const pairs: Record<string, string> = {
  きゃ: 'kya',
  きゅ: 'kyu',
  きょ: 'kyo',
  ぎゃ: 'gya',
  ぎゅ: 'gyu',
  ぎょ: 'gyo',
  しゃ: 'sha',
  しゅ: 'shu',
  しょ: 'sho',
  じゃ: 'ja',
  じゅ: 'ju',
  じょ: 'jo',
  ちゃ: 'cha',
  ちゅ: 'chu',
  ちょ: 'cho',
  にゃ: 'nya',
  にゅ: 'nyu',
  にょ: 'nyo',
  ひゃ: 'hya',
  ひゅ: 'hyu',
  ひょ: 'hyo',
  びゃ: 'bya',
  びゅ: 'byu',
  びょ: 'byo',
  ぴゃ: 'pya',
  ぴゅ: 'pyu',
  ぴょ: 'pyo',
  みゃ: 'mya',
  みゅ: 'myu',
  みょ: 'myo',
  りゃ: 'rya',
  りゅ: 'ryu',
  りょ: 'ryo',
  ふぁ: 'fa',
  ふぃ: 'fi',
  ふぇ: 'fe',
  ふぉ: 'fo',
  てぃ: 'ti',
  でぃ: 'di',
  ゔぁ: 'va',
  ゔぃ: 'vi',
  ゔぇ: 've',
  ゔぉ: 'vo',
};
export function romanize(input: string) {
  const text = input
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 96));
  let output = '',
    doubled = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === 'っ') {
      doubled = true;
      continue;
    }
    if (c === 'ー') {
      output += output.match(/[aeiou](?=[^aeiou]*$)/)?.[0] || '';
      continue;
    }
    const pair = pairs[text.slice(i, i + 2)];
    let syllable = pair || kana[c] || c;
    if (pair) i++;
    if (c === 'ん' && /^[あいうえおやゆよ]/.test(text.slice(i + 1)))
      syllable = "n'";
    if (doubled) {
      syllable = (syllable.startsWith('ch') ? 't' : syllable[0]) + syllable;
      doubled = false;
    }
    output += syllable;
  }
  return output;
}

export function shuffled<T>(items: readonly T[], random = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function makeQuestion(
  word: CastleWord,
  pool: readonly CastleWord[],
  id: number,
  kind: QuestionKind,
  random = Math.random,
): CastleQuestion {
  const value = (item: CastleWord) =>
    kind === 'reading'
      ? item.hiragana
      : kind === 'meaning'
      ? item.meaning
      : item.kanji;
  const correct = value(word);
  const candidates = shuffled(
    pool.filter(
      item =>
        item.id !== word.id &&
        (kind !== 'kanji' || item.hiragana !== word.hiragana) &&
        (kind !== 'reverse' || item.meaning !== word.meaning),
    ),
    random,
  ).sort(
    (a, b) =>
      Number(b.category === word.category) -
      Number(a.category === word.category),
  );
  const options = [correct];
  for (const item of candidates) {
    const option = value(item);
    if (!options.includes(option)) options.push(option);
    if (options.length === 4) break;
  }
  if (options.length < 4)
    throw new Error(
      'Bộ từ cần ít nhất 4 đáp án khác nhau cho mỗi dạng câu hỏi.',
    );
  const mixed = shuffled(options, random);
  return {
    id,
    word,
    kind,
    prompt:
      kind === 'kanji'
        ? word.hiragana
        : kind === 'reverse'
        ? word.meaning
        : word.kanji,
    reading: kind === 'meaning' ? word.hiragana : undefined,
    instruction: {
      reading: 'Chọn cách đọc đúng',
      kanji: 'Chọn từ tiếng Nhật',
      meaning: 'Chọn nghĩa tiếng Việt',
      reverse: 'Chọn từ tương ứng',
    }[kind],
    options: mixed,
    correct: mixed.indexOf(correct),
  };
}
