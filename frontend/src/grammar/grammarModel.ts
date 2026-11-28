export const grammarLevels = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export type GrammarLevel = (typeof grammarLevels)[number];
export type GrammarExample = { ja: string; vi: string; cl?: string };
export type GrammarPattern = {
  id: string;
  g: number;
  pat: string;
  mean: string;
  core?: string;
  form?: string[];
  exp?: string[];
  note?: string[];
  senses?: { n: number; label: string; ex: GrammarExample[] }[];
  cmp?: { pat: string; lv: string; desc: string; id?: string }[];
};
export type GrammarGroup = { n: number; ja: string; vi: string; desc: string };
export type GrammarQuestion = {
  id: string;
  prompt: string;
  sentence: string;
  translation: string;
  explanation?: string;
  options?: string[];
  answer: string;
};
type SourceQuestion = {
  q: string;
  opts: string[];
  ans: number;
  ja: string;
  vi: string;
  exp?: string;
};
export type GrammarCatalog = {
  levels: {
    level: GrammarLevel;
    groups: GrammarGroup[];
    patterns: GrammarPattern[];
    tests?: { n: number; qs: SourceQuestion[] }[];
  }[];
};

export function plainJapanese(text: string, reading = false) {
  return text
    .replace(/([\p{Script=Han}々]+)\[([^\]]+)\]/gu, (_, base, kana) =>
      reading ? kana : base,
    )
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[{}]/g, '');
}

export function searchKey(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .normalize('NFKC')
    .trim();
}

export function grammarSearchText(pattern: GrammarPattern) {
  return searchKey(
    [
      plainJapanese(pattern.pat),
      plainJapanese(pattern.pat, true),
      pattern.mean,
      pattern.core,
    ].join(' '),
  );
}

export function answerKey(value: string) {
  return plainJapanese(value)
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, character =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    )
    .replace(/[\s、。,.]/g, '');
}

export function exampleQuestions(pattern: GrammarPattern): GrammarQuestion[] {
  return (pattern.senses ?? []).flatMap((sense, senseIndex) =>
    sense.ex.flatMap((example, index) => {
      const marked = [...example.ja.matchAll(/\{([^{}]+)\}/g)];
      if (
        !example.cl ||
        marked.length !== 1 ||
        answerKey(marked[0][1]) !== answerKey(example.cl)
      )
        return [];
      return [
        {
          id: `${pattern.id}:example:${senseIndex}:${index}`,
          prompt: example.ja.replace(marked[0][0], '（　　）'),
          sentence: example.ja,
          translation: example.vi,
          explanation: pattern.core,
          answer: marked[0][1],
        },
      ];
    }),
  );
}

export function groupQuestions(
  level: GrammarCatalog['levels'][number],
  group: number,
) {
  const authored: GrammarQuestion[] = (level.tests ?? [])
    .filter(test => test.n === group)
    .flatMap(test =>
      test.qs.flatMap((question, index) => {
        const answer = question.opts[question.ans - 1];
        return answer
          ? [
              {
                id: `${level.level}:${group}:test:${index}`,
                prompt: question.q,
                sentence: question.ja,
                translation: question.vi,
                explanation: question.exp,
                options: question.opts,
                answer,
              },
            ]
          : [];
      }),
    );
  if (authored.length) return authored;
  return level.patterns
    .filter(pattern => pattern.g === group)
    .flatMap(pattern => exampleQuestions(pattern).slice(0, 1))
    .slice(0, 10);
}

export type GrammarProgress = {
  learned: string[];
  saved: string[];
  missed: string[];
};

export function loadGrammarProgress(key: string): GrammarProgress {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? '{}');
    const ids = (value: unknown) =>
      Array.isArray(value)
        ? [
            ...new Set(
              value.filter((id): id is string => typeof id === 'string'),
            ),
          ]
        : [];
    return {
      learned: ids(data.learned),
      saved: ids(data.saved),
      missed: ids(data.missed),
    };
  } catch {
    return { learned: [], saved: [], missed: [] };
  }
}
