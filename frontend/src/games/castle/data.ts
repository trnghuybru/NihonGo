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

// Bộ khởi động do game cung cấp. Thêm từ: kanji | hiragana | nghĩa | chủ đề.
const packs: Record<string, string> = {
  N5: `学校|がっこう|trường học|Học tập
先生|せんせい|giáo viên|Học tập
学生|がくせい|học sinh, sinh viên|Học tập
本|ほん|sách|Học tập
新聞|しんぶん|báo|Học tập
言葉|ことば|từ ngữ|Học tập
名前|なまえ|tên|Học tập
日本語|にほんご|tiếng Nhật|Học tập
父|ちち|bố của mình|Gia đình
母|はは|mẹ của mình|Gia đình
兄|あに|anh trai của mình|Gia đình
姉|あね|chị gái của mình|Gia đình
弟|おとうと|em trai|Gia đình
妹|いもうと|em gái|Gia đình
家族|かぞく|gia đình|Gia đình
子供|こども|trẻ em|Gia đình
友達|ともだち|bạn bè|Gia đình
犬|いぬ|chó|Động vật
猫|ねこ|mèo|Động vật
鳥|とり|chim|Động vật
魚|さかな|cá|Động vật
馬|うま|ngựa|Động vật
牛|うし|bò|Động vật
豚|ぶた|lợn|Động vật
ご飯|ごはん|cơm|Ăn uống
卵|たまご|trứng|Ăn uống
肉|にく|thịt|Ăn uống
野菜|やさい|rau|Ăn uống
果物|くだもの|trái cây|Ăn uống
牛乳|ぎゅうにゅう|sữa bò|Ăn uống
お茶|おちゃ|trà|Ăn uống
料理|りょうり|món ăn, việc nấu ăn|Ăn uống
水|みず|nước|Thiên nhiên
川|かわ|sông|Thiên nhiên
山|やま|núi|Thiên nhiên
雨|あめ|mưa|Thiên nhiên
雪|ゆき|tuyết|Thiên nhiên
空|そら|bầu trời|Thiên nhiên
花|はな|hoa|Thiên nhiên
天気|てんき|thời tiết|Thiên nhiên
時計|とけい|đồng hồ|Đời sống
電話|でんわ|điện thoại|Đời sống
電車|でんしゃ|tàu điện|Đời sống
駅|えき|nhà ga|Đời sống
車|くるま|ô tô|Đời sống
自転車|じてんしゃ|xe đạp|Đời sống
病院|びょういん|bệnh viện|Đời sống
銀行|ぎんこう|ngân hàng|Đời sống
会社|かいしゃ|công ty|Đời sống
部屋|へや|căn phòng|Đời sống
窓|まど|cửa sổ|Đời sống
机|つくえ|bàn|Đời sống
椅子|いす|ghế|Đời sống
食べる|たべる|ăn|Động từ
飲む|のむ|uống|Động từ
読む|よむ|đọc|Động từ
書く|かく|viết|Động từ
聞く|きく|nghe|Động từ
話す|はなす|nói|Động từ
見る|みる|nhìn, xem|Động từ
行く|いく|đi|Động từ
来る|くる|đến|Động từ
帰る|かえる|về|Động từ
買う|かう|mua|Động từ
会う|あう|gặp|Động từ
休む|やすむ|nghỉ ngơi|Động từ
寝る|ねる|ngủ|Động từ
起きる|おきる|thức dậy|Động từ
働く|はたらく|làm việc|Động từ
一|いち|một|Số đếm
二|に|hai|Số đếm
三|さん|ba|Số đếm
四|よん|bốn|Số đếm
五|ご|năm|Số đếm
六|ろく|sáu|Số đếm
七|なな|bảy|Số đếm
八|はち|tám|Số đếm
九|きゅう|chín|Số đếm
十|じゅう|mười|Số đếm
百|ひゃく|một trăm|Số đếm
千|せん|một nghìn|Số đếm`,
  N4: `住所|じゅうしょ|địa chỉ|Đời sống
受付|うけつけ|quầy tiếp nhận|Đời sống
会場|かいじょう|địa điểm tổ chức|Đời sống
約束|やくそく|lời hẹn, lời hứa|Đời sống
用事|ようじ|việc cần làm|Đời sống
予定|よてい|dự định, lịch trình|Đời sống
準備|じゅんび|sự chuẩn bị|Đời sống
連絡|れんらく|sự liên lạc|Đời sống
説明|せつめい|sự giải thích|Học tập
質問|しつもん|câu hỏi|Học tập
答え|こたえ|câu trả lời|Học tập
意味|いみ|ý nghĩa|Học tập
意見|いけん|ý kiến|Học tập
理由|りゆう|lý do|Học tập
入学|にゅうがく|nhập học|Học tập
卒業|そつぎょう|tốt nghiệp|Học tập
出席|しゅっせき|có mặt, tham dự|Học tập
欠席|けっせき|vắng mặt|Học tập
試験|しけん|kỳ thi|Học tập
合格|ごうかく|thi đỗ|Học tập
生活|せいかつ|cuộc sống, sinh hoạt|Xã hội
習慣|しゅうかん|thói quen|Xã hội
文化|ぶんか|văn hóa|Xã hội
交通|こうつう|giao thông|Xã hội
事故|じこ|tai nạn|Xã hội
故障|こしょう|hỏng hóc|Xã hội
運転|うんてん|việc lái xe|Xã hội
利用|りよう|sự sử dụng|Xã hội
予約|よやく|việc đặt trước|Đời sống
注文|ちゅうもん|việc gọi món, đặt hàng|Đời sống
相談|そうだん|sự bàn bạc, tư vấn|Đời sống
紹介|しょうかい|sự giới thiệu|Đời sống
招待|しょうたい|lời mời|Đời sống
案内|あんない|sự hướng dẫn|Đời sống
出発|しゅっぱつ|sự khởi hành|Đời sống
到着|とうちゃく|sự đến nơi|Đời sống
安心|あんしん|yên tâm|Tính chất
心配|しんぱい|lo lắng|Tính chất
残念|ざんねん|đáng tiếc|Tính chất
必要|ひつよう|cần thiết|Tính chất
大切|たいせつ|quan trọng, quý giá|Tính chất
便利|べんり|tiện lợi|Tính chất
不便|ふべん|bất tiện|Tính chất
安全|あんぜん|an toàn|Tính chất
危険|きけん|nguy hiểm|Tính chất
自由|じゆう|tự do|Tính chất
簡単|かんたん|đơn giản|Tính chất
特別|とくべつ|đặc biệt|Tính chất`,
  N3: `要求|ようきゅう|yêu cầu|Công việc
提案|ていあん|đề xuất|Công việc
報告|ほうこく|báo cáo|Công việc
確認|かくにん|xác nhận|Công việc
変更|へんこう|thay đổi|Công việc
影響|えいきょう|ảnh hưởng|Xã hội
原因|げんいん|nguyên nhân|Xã hội
結果|けっか|kết quả|Xã hội
状況|じょうきょう|tình hình|Xã hội
関係|かんけい|mối quan hệ|Xã hội
責任|せきにん|trách nhiệm|Công việc
努力|どりょく|nỗ lực|Công việc
協力|きょうりょく|hợp tác|Công việc
成長|せいちょう|trưởng thành, phát triển|Xã hội
判断|はんだん|phán đoán|Công việc
選択|せんたく|lựa chọn|Công việc
記憶|きおく|trí nhớ|Học tập
知識|ちしき|kiến thức|Học tập
能力|のうりょく|năng lực|Học tập
態度|たいど|thái độ|Học tập`,
  N2: `分析|ぶんせき|phân tích|Công việc
比較|ひかく|so sánh|Công việc
評価|ひょうか|đánh giá|Công việc
改善|かいぜん|cải thiện|Công việc
対策|たいさく|biện pháp đối phó|Công việc
傾向|けいこう|xu hướng|Xã hội
資源|しげん|tài nguyên|Xã hội
環境|かんきょう|môi trường|Xã hội
制度|せいど|chế độ, hệ thống|Xã hội
管理|かんり|quản lý|Công việc
利益|りえき|lợi ích, lợi nhuận|Công việc
損失|そんしつ|tổn thất|Công việc
貿易|ぼうえき|ngoại thương|Xã hội
需要|じゅよう|nhu cầu|Xã hội
供給|きょうきゅう|sự cung cấp|Xã hội
効率|こうりつ|hiệu suất|Công việc
課題|かだい|vấn đề, nhiệm vụ cần giải quyết|Công việc
証拠|しょうこ|bằng chứng|Xã hội
主張|しゅちょう|chủ trương, lập luận|Xã hội
対象|たいしょう|đối tượng|Xã hội`,
  N1: `把握|はあく|nắm bắt|Công việc
概念|がいねん|khái niệm|Xã hội
根拠|こんきょ|căn cứ|Xã hội
妥協|だきょう|thỏa hiệp|Công việc
促進|そくしん|thúc đẩy|Công việc
抑制|よくせい|kiềm chế|Công việc
是正|ぜせい|chấn chỉnh|Công việc
配慮|はいりょ|sự cân nhắc, quan tâm|Công việc
懸念|けねん|mối lo ngại|Xã hội
均衡|きんこう|sự cân bằng|Xã hội
措置|そち|biện pháp xử lý|Công việc
遂行|すいこう|thi hành|Công việc
模索|もさく|sự tìm tòi|Công việc
打開|だかい|khai thông, phá vỡ bế tắc|Công việc
衰退|すいたい|suy thoái|Xã hội
繁栄|はんえい|sự phồn thịnh|Xã hội
顕著|けんちょ|rõ rệt|Tính chất
巧妙|こうみょう|khéo léo, tinh vi|Tính chất
柔軟|じゅうなん|mềm dẻo, linh hoạt|Tính chất
厳密|げんみつ|nghiêm ngặt, chặt chẽ|Tính chất`,
};
export const starterWords: CastleWord[] = Object.entries(packs).flatMap(
  ([level, pack]) =>
    pack.split('\n').map(row => {
      const [kanji, hiragana, meaning, category] = row.split('|');
      return {
        id: `starter-${level}-${kanji}-${hiragana}`,
        kanji,
        hiragana,
        romaji: romanize(hiragana),
        meaning,
        category,
        level,
      };
    }),
);
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
