import {
  answerKey,
  exampleQuestions,
  grammarLevels,
  grammarSearchText,
  groupQuestions,
  searchKey,
} from '../src/grammar/grammarModel';
import type { GrammarCatalog } from '../src/grammar/grammarModel';

const catalog: GrammarCatalog = require('../src/grammar/grammar-data.json');

test('the catalog has 630 unique patterns and usable exercises at every level', () => {
  const patterns = catalog.levels.flatMap(level => level.patterns);
  expect(patterns).toHaveLength(630);
  expect(new Set(patterns.map(pattern => pattern.id)).size).toBe(630);
  expect(catalog.levels.map(level => level.level).sort()).toEqual(
    [...grammarLevels].sort(),
  );
  for (const level of catalog.levels) {
    const questions = level.groups.flatMap(group =>
      groupQuestions(level, group.n),
    );
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      if (question.options) expect(question.options).toContain(question.answer);
      expect(answerKey(question.answer)).not.toBe('');
    }
  }
});

test('Vietnamese accents and furigana do not block searching', () => {
  const pattern = catalog.levels.find(level => level.level === 'N1')!
    .patterns[0];
  expect(grammarSearchText(pattern)).toContain(searchKey('vua moi'));
  expect(grammarSearchText(pattern)).toContain('がはやいか');
});

test('cloze masks the marked grammar span and normalizes kana and kanji answers', () => {
  const pattern = catalog.levels.find(level => level.level === 'N1')!
    .patterns[0];
  const [question] = exampleQuestions(pattern);
  expect(question.prompt).toContain('（　　）');
  expect(question.prompt).not.toContain('{が早');
  expect(answerKey(question.answer)).toBe(answerKey('が早いか'));
  expect(answerKey('ガハヤイカ')).toBe(answerKey('がはやいか'));
});
