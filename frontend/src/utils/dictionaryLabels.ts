// JMdict expands its POS codes into English descriptions. Localize presentation
// here so the source data and sense restrictions remain intact.
const partsOfSpeech: Record<string, string> = {
  noun: 'Danh từ',
  verb: 'Động từ',
  adjective: 'Tính từ',
  adverb: 'Trạng từ',
  pronoun: 'Đại từ',
  name: 'Danh từ riêng',
  unknown: 'Chưa phân loại',
  character: 'Ký tự',
  phrase: 'Cụm từ',
  proverb: 'Tục ngữ',
  'noun (common) (futsuumeishi)': 'Danh từ',
  'adverbial noun (fukushitekimeishi)': 'Danh từ dùng như trạng từ',
  'proper noun': 'Danh từ riêng',
  'noun, used as a prefix': 'Danh từ dùng làm tiền tố',
  'noun, used as a suffix': 'Danh từ dùng làm hậu tố',
  'noun (temporal) (jisoumeishi)': 'Danh từ chỉ thời gian',
  numeric: 'Số từ',
  prefix: 'Tiền tố',
  particle: 'Trợ từ',
  suffix: 'Hậu tố',
  unclassified: 'Chưa phân loại',
  'noun or verb acting prenominally':
    'Danh từ hoặc động từ bổ nghĩa cho danh từ',
  'adjective (keiyoushi)': 'Tính từ đuôi い',
  'adjective (keiyoushi) - yoi/ii class': 'Tính từ いい・よい',
  "'kari' adjective (archaic)": 'Tính từ かり (cổ)',
  "'ku' adjective (archaic)": 'Tính từ く (cổ)',
  'adjectival nouns or quasi-adjectives (keiyodoshi)': 'Tính từ đuôi な',
  'archaic/formal form of na-adjective': 'Tính từ な dạng cổ hoặc trang trọng',
  "nouns which may take the genitive case particle 'no'":
    'Danh từ kết hợp với の',
  'pre-noun adjectival (rentaishi)': 'Từ định ngữ',
  "'shiku' adjective (archaic)": 'Tính từ しく (cổ)',
  "'taru' adjective": 'Tính từ たる',
  'adverb (fukushi)': 'Trạng từ',
  "adverb taking the 'to' particle": 'Trạng từ kết hợp với と',
  auxiliary: 'Từ phụ trợ',
  'auxiliary adjective': 'Trợ tính từ',
  'auxiliary verb': 'Trợ động từ',
  conjunction: 'Liên từ',
  copula: 'Hệ từ',
  counter: 'Từ đếm',
  'expressions (phrases, clauses, etc.)': 'Cụm từ, cách diễn đạt',
  'interjection (kandoushi)': 'Thán từ',
  'verb unspecified': 'Động từ chưa phân nhóm',
  'Ichidan verb': 'Động từ nhóm 2',
  'Ichidan verb - kureru special class': 'Động từ nhóm 2 (くれる, ngoại lệ)',
  "Nidan verb with 'u' ending (archaic)": 'Động từ nhị đoạn đuôi う (cổ)',
  "Nidan verb (lower class) with 'u' ending and 'we' conjugation (archaic)":
    'Động từ nhị đoạn hạ đuôi う, chia với ゑ (cổ)',
  'Godan verb - -aru special class': 'Động từ nhóm 1 (đuôi ある, ngoại lệ)',
  'Godan verb - Iku/Yuku special class':
    'Động từ nhóm 1 (いく・ゆく, ngoại lệ)',
  'Godan verb - Uru old class verb (old form of Eru)':
    'Động từ うる (dạng cổ của える)',
  'intransitive verb': 'Tự động từ',
  'transitive verb': 'Ngoại động từ',
  'Kuru verb - special class': 'Động từ bất quy tắc くる',
  'irregular nu verb': 'Động từ bất quy tắc đuôi ぬ',
  'irregular ru verb, plain form ends with -ri': 'Động từ bất quy tắc đuôi り',
  'noun or participle which takes the aux. verb suru': 'Động từ với する',
  'su verb - precursor to the modern suru': 'Động từ す (dạng cổ của する)',
  'suru verb - included': 'Động từ する',
  'suru verb - special class': 'Động từ する (ngoại lệ)',
  'Ichidan verb - zuru verb (alternative form of -jiru verbs)':
    'Động từ nhóm 2 (ずる, biến thể của じる)',
};

const endings: Record<string, string> = {
  bu: 'ぶ',
  dzu: 'づ',
  gu: 'ぐ',
  'hu/fu': 'ふ',
  ku: 'く',
  mu: 'む',
  nu: 'ぬ',
  ru: 'る',
  su: 'す',
  tsu: 'つ',
  u: 'う',
  yu: 'ゆ',
  zu: 'ず',
};

function partOfSpeechLabel(value: string): string {
  if (partsOfSpeech[value]) return partsOfSpeech[value];
  const verb =
    /^(Godan|Yodan) verb with '([^']+)' ending(?: \(([^)]+)\))?$/.exec(value);
  if (verb) {
    const ending = endings[verb[2]] ?? verb[2];
    if (verb[1] === 'Yodan') return `Động từ tứ đoạn đuôi ${ending} (cổ)`;
    const special = verb[3] ? ', ngoại lệ' : '';
    return `Động từ nhóm 1 (đuôi ${ending}${special})`;
  }
  const nidan =
    /^Nidan verb \((upper|lower) class\) with '([^']+)' ending \(archaic\)$/.exec(
      value,
    );
  if (nidan) {
    const group = nidan[1] === 'upper' ? 'thượng' : 'hạ';
    return `Động từ nhị đoạn ${group} đuôi ${
      endings[nidan[2]] ?? nidan[2]
    } (cổ)`;
  }
  // Vietnamese Wiktionary already supplies Vietnamese POS labels.
  return value;
}

export function formatDictionaryPartsOfSpeech(values: string[]): string {
  return [...new Set(values.map(partOfSpeechLabel))].join(' · ');
}
