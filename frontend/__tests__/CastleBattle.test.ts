import {
  CastleBattle,
  CastleConfig,
  LEFT_GATE,
  RIGHT_GATE,
  tierFor,
} from '../src/games/castle/engine';
import {
  CastleWord,
  makeQuestion,
  romanize,
  starterWords,
} from '../src/games/castle/data';
import { decodeProgress } from '../src/games/castle/progress.types';

const pool = starterWords.filter(word => word.level === 'N5');
function battle(extra: Partial<CastleConfig> = {}) {
  const game = new CastleBattle(
    {
      words: pool,
      mode: 'local',
      difficulty: 'normal',
      roundSeconds: 9,
      names: ['A', 'B'],
      ...extra,
    },
    () => 0.42,
  );
  game.update(3000);
  return game;
}
function troop(side: 0 | 1, x: number, hp = 18, power = 7) {
  return {
    id: side + 1,
    side,
    x,
    hp,
    maxHp: hp,
    power,
    speed: 100,
    tier: 0,
    attackAt: 0,
  };
}
describe('Kho từ và câu hỏi công thành', () => {
  test('đủ bộ từ, tất cả có cách đọc và nghĩa', () => {
    expect(pool.length).toBeGreaterThanOrEqual(60);
    expect(
      starterWords.filter(word => word.level === 'N4').length,
    ).toBeGreaterThanOrEqual(40);
    for (const word of starterWords) {
      expect(word.hiragana).toMatch(/^[ぁ-ゖー]+$/);
      expect(word.romaji.length).toBeGreaterThan(0);
      expect(word.meaning.length).toBeGreaterThan(0);
    }
  });
  test('mọi từ có 4 lựa chọn duy nhất, đáp án đúng ở mỗi dạng', () => {
    for (const word of starterWords)
      for (const kind of ['reading', 'kanji', 'meaning', 'reverse'] as const) {
        const question = makeQuestion(
          word,
          starterWords.filter(w => w.level === word.level),
          1,
          kind,
        );
        expect(new Set(question.options).size).toBe(4);
        expect(question.options[question.correct]).toBe(
          kind === 'reading'
            ? word.hiragana
            : kind === 'meaning'
            ? word.meaning
            : word.kanji,
        );
      }
  });
  test('không đặt hai từ đồng âm / đồng nghĩa làm hai đáp án đúng', () => {
    const word = pool[0];
    const homophone: CastleWord = { ...word, id: 'homophone', kanji: '同音' };
    const question = makeQuestion(
      word,
      [word, homophone, ...pool.slice(1)],
      1,
      'kanji',
    );
    expect(question.options).not.toContain('同音');
    const reverse = makeQuestion(
      word,
      [word, homophone, ...pool.slice(1)],
      1,
      'reverse',
    );
    expect(reverse.options).not.toContain('同音');
  });
  test('romaji xử lý âm ghép, âm ngắt và katakana', () => {
    expect(romanize('がっこう')).toBe('gakkou');
    expect(romanize('でんしゃ')).toBe('densha');
    expect(romanize('まっちゃ')).toBe('matcha');
    expect(romanize('コーヒー')).toBe('koohii');
  });
  test('bộ nhỏ hoặc thiếu đáp án báo lỗi rõ ràng', () => {
    expect(() => battle({ words: pool.slice(0, 3) })).toThrow();
    expect(() =>
      battle({
        words: pool.slice(0, 5).map(word => ({ ...word, hiragana: 'あ' })),
      }),
    ).toThrow();
  });
});
describe('Luật trận đấu', () => {
  test('hai người trả lời cùng nhịp đều được tính; chặn gửi lặp và câu cũ', () => {
    const game = battle(),
      question = game.question!;
    expect(game.answer(0, question.correct, question.id)).toBe(true);
    expect(game.answer(1, question.correct, question.id)).toBe(true);
    expect(game.players.map(p => p.correct)).toEqual([1, 1]);
    expect(game.troops).toHaveLength(2);
    expect(game.answer(0, question.correct, question.id)).toBe(false);
    game.update(1000);
    expect(game.question!.id).toBe(2);
    expect(game.answer(0, question.correct, question.id)).toBe(false);
  });
  test('sai mất combo, không sinh quân và lưu từ cần ôn', () => {
    const game = battle(),
      question = game.question!;
    game.players[0].combo = 5;
    game.answer(0, (question.correct + 1) % 4, question.id);
    expect(game.players[0].combo).toBe(0);
    expect(game.players[0].cooldownUntil).toBe(game.now + 1000);
    expect(game.troops).toHaveLength(0);
    expect(game.mistakes[0].has(question.word.id)).toBe(true);
  });
  test('combo đúng cấp quân và trả lời nhanh tăng sức mạnh', () => {
    expect([0, 2, 3, 4, 5, 9, 10].map(tierFor)).toEqual([0, 0, 1, 1, 2, 2, 3]);
    const fast = battle(),
      slow = battle();
    slow.update(7000);
    fast.answer(0, fast.question!.correct, 1);
    slow.answer(0, slow.question!.correct, 1);
    expect(fast.troops[0].power).toBeGreaterThan(slow.troops[0].power);
    expect(fast.troops[0].speed).toBeGreaterThan(slow.troops[0].speed);
  });
  test('hết giờ khóa đáp án và ghi nhận bỏ lỡ cho cả hai', () => {
    const game = battle(),
      question = game.question!;
    game.update(9000);
    expect(game.answer(0, question.correct, question.id)).toBe(false);
    expect(game.players.map(p => p.missed)).toEqual([1, 1]);
    expect(game.mistakes[0].size).toBe(1);
    game.update(1000);
    expect(game.round).toBe(2);
  });
  test('lính không xuyên nhau dù cập nhật một khoảng lớn, quân mạnh còn HP giảm', () => {
    const game = battle();
    game.troops = [troop(0, 500, 42, 15), troop(1, 570)];
    game.update(500);
    const a = game.troops.find(t => t.side === 0)!,
      b = game.troops.find(t => t.side === 1);
    expect(a.hp).toBeLessThan(42);
    expect(a.hp).toBeGreaterThan(0);
    if (b) expect(a.x).toBeLessThan(b.x);
    game.update(500);
    expect(game.troops.some(t => t.side === 1)).toBe(false);
  });
  test('sát thương thành đồng thời, HP không âm và hòa khi cùng sụp', () => {
    const game = battle();
    game.players.forEach(p => {
      p.hp = 1;
    });
    game.troops = [troop(0, RIGHT_GATE - 1), troop(1, LEFT_GATE + 1)];
    game.update(20);
    expect(game.players.map(p => p.hp)).toEqual([0, 0]);
    expect(game.winner).toBeNull();
    expect(game.phase).toBe('ending');
    game.update(1000);
    expect(game.phase).toBe('finished');
  });
  test('mưa tên cần năng lượng và đánh đúng phe, khiên có hiệu lực đúng 5 giây', () => {
    const game = battle();
    game.troops = [troop(0, 200), troop(1, 1000, 40)];
    expect(game.skill(0, 'arrow')).toBe(false);
    game.players[0].energy = 100;
    expect(game.skill(0, 'arrow')).toBe(true);
    expect(game.troops.map(t => t.hp)).toEqual([18, 16]);
    expect(game.players[0].energy).toBe(0);
    game.players[0].energy = 100;
    game.skill(0, 'shield');
    const expiry = game.now + 5000;
    expect(game.players[0].shieldUntil).toBe(expiry);
    game.troops = [troop(1, LEFT_GATE + 1)];
    game.update(20);
    expect(game.players[0].hp).toBe(100);
    game.update(5000);
    expect(game.players[0].shieldUntil).toBeLessThan(game.now);
    game.troops = [troop(1, LEFT_GATE + 1)];
    game.update(20);
    expect(game.players[0].hp).toBe(93);
  });
  test('tạm dừng đóng băng thời gian, đáp án và kỹ năng', () => {
    const game = battle();
    game.paused = true;
    const before = game.now;
    game.players[0].energy = 100;
    game.update(20000);
    expect(game.now).toBe(before);
    expect(game.answer(0, game.question!.correct, 1)).toBe(false);
    expect(game.skill(0, 'shield')).toBe(false);
  });
  test('đủ 60 câu kết thúc đúng một lần, không tiếp tục sinh câu', () => {
    const game = battle();
    for (let i = 0; i < 60; i++) {
      const question = game.question!;
      game.answer(0, (question.correct + 1) % 4, question.id);
      game.answer(1, (question.correct + 1) % 4, question.id);
      game.update(1000);
    }
    game.update(1000);
    expect(game.phase).toBe('finished');
    expect(game.round).toBe(60);
    const now = game.now;
    game.update(999999);
    expect(game.now).toBe(now);
    expect(game.events.filter(e => e.kind === 'end')).toHaveLength(1);
  });
  test('giới hạn trận 3 phút dù bỏ toàn bộ câu; bot không chạy trong local', () => {
    const game = battle();
    game.update(181000);
    expect(game.phase).toBe('finished');
    expect(game.elapsed).toBe(180000);
    expect(game.players[1].correct).toBe(0);
    expect(game.players[1].responses).toHaveLength(0);
    const bot = battle({ mode: 'bot', difficulty: 'hard' });
    bot.update(2500);
    expect(bot.players[1].choice).not.toBeNull();
  });
});
test('đọc tiến trình lỗi và dữ liệu cũ an toàn', () => {
  expect(decodeProgress('invalid').mistakes).toEqual([]);
  const progress = decodeProgress(
    JSON.stringify({
      best: { N5: 100, N4: -1, bad: 10 },
      mistakes: [null, {}, pool[0]],
      settings: { roundSeconds: 50, music: false },
    }),
  );
  expect(progress.best).toEqual({ N5: 100 });
  expect(progress.mistakes).toEqual([pool[0]]);
  expect(progress.settings.roundSeconds).toBe(9);
  expect(progress.settings.music).toBe(false);
});
