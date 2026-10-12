import { rubyParts } from '../src/components/ShadowingWordLookup';

test('furigana aligns to kanji and keeps inflection kana visible', () => {
  expect(rubyParts('立った', 'たった')).toEqual([
    { text: '立', reading: 'た' },
    { text: 'った' },
  ]);
  expect(rubyParts('言って', 'いって')).toEqual([
    { text: '言', reading: 'い' },
    { text: 'って' },
  ]);
  expect(rubyParts('食べ物', 'たべもの')).toEqual([
    { text: '食', reading: 'た' },
    { text: 'べ' },
    { text: '物', reading: 'もの' },
  ]);
  expect(rubyParts('最近', 'さいきん')).toEqual([
    { text: '最近', reading: 'さいきん' },
  ]);
  expect(rubyParts('おばさん', 'おばさん')).toEqual([{ text: 'おばさん' }]);
  expect(rubyParts('語', '')).toEqual([{ text: '語' }]);
});
