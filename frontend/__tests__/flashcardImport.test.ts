import { parseFlashcardImport } from '../src/utils/flashcardImport';

const defaults = {
  fieldSeparator: '\t',
  cardSeparator: '\n',
  skipHeader: false,
};
test('pasted spreadsheet text supports BOM, CRLF, blank lines and optional readings', () => {
  expect(
    parseFlashcardImport(
      '\uFEFF学校\ttrường học\r\n人生\tじんせい\tcuộc đời\r\n\r\n',
      defaults,
    ),
  ).toEqual({
    cards: [
      { front: '学校', reading: '', back: 'trường học' },
      { front: '人生', reading: 'じんせい', back: 'cuộc đời' },
    ],
    errors: [],
  });
});
test('quoted fields preserve delimiters, newlines and escaped quotes', () => {
  const result = parseFlashcardImport(
    'word,meaning\n学校,"trường, học\nđọc ""sách"""',
    { ...defaults, fieldSeparator: ',', skipHeader: true },
  );
  expect(result).toEqual({
    cards: [{ front: '学校', reading: '', back: 'trường, học\nđọc "sách"' }],
    errors: [],
  });
});
test('supports custom multi-character separators and semicolon between cards', () => {
  expect(
    parseFlashcardImport('学校::trường học;人生::cuộc đời;', {
      ...defaults,
      fieldSeparator: '::',
      cardSeparator: ';',
    }).cards,
  ).toHaveLength(2);
});
test.each(['', '\n', '"'])(
  'rejects invalid or conflicting column separator %p',
  fieldSeparator => {
    expect(
      parseFlashcardImport('学校\ttrường học', { ...defaults, fieldSeparator })
        .errors,
    ).not.toHaveLength(0);
  },
);
test('reports malformed rows without silently treating partial input as valid', () => {
  const result = parseFlashcardImport(
    '学校\ttrường học\n人生\n\tthiếu từ\na\tb\tc\td',
    defaults,
  );
  expect(result.cards).toHaveLength(1);
  expect(result.errors).toEqual([
    'Dòng 2: cần 2 hoặc 3 cột.',
    'Dòng 3: thiếu từ hoặc nghĩa.',
    'Dòng 4: cần 2 hoặc 3 cột.',
  ]);
});
test.each(['学校\t"chưa đóng', '学校\t"nghĩa"thừa', '学"校\tnghĩa'])(
  'rejects malformed quotes %p',
  text => {
    const result = parseFlashcardImport(text, defaults);
    expect(result.cards).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  },
);
test('enforces length and deck size limits without truncating', () => {
  const rows = Array.from({ length: 100 }, () => '学校\ttrường học');
  expect(parseFlashcardImport(rows.join('\n'), defaults).cards).toHaveLength(
    100,
  );
  expect(
    parseFlashcardImport([...rows, rows[0]].join('\n'), defaults).cards,
  ).toHaveLength(0);
  expect(
    parseFlashcardImport('学'.repeat(101) + '\tnghĩa', defaults).errors,
  ).toHaveLength(1);
  expect(
    parseFlashcardImport('学'.repeat(500001), defaults).errors,
  ).toHaveLength(1);
});
