import {
  CastleWord,
  CastleQuestion,
  QuestionKind,
  makeQuestion,
  shuffled,
} from './data';
export type Side = 0 | 1;
export type Difficulty = 'easy' | 'normal' | 'hard';
export type CastleConfig = {
  mode: 'bot' | 'local' | 'online';
  difficulty: Difficulty;
  roundSeconds: 8 | 9 | 10;
  words: CastleWord[];
  targets?: CastleWord[];
  names: [string, string];
};
export type Choice = {
  index: number | null;
  correct: boolean;
  timeout?: boolean;
};
export type Commander = {
  name: string;
  hp: number;
  energy: number;
  combo: number;
  bestCombo: number;
  correct: number;
  wrong: number;
  missed: number;
  responses: number[];
  shieldUntil: number;
  cooldownUntil: number;
  choice: Choice | null;
};
export type Troop = {
  id: number;
  side: Side;
  x: number;
  hp: number;
  maxHp: number;
  power: number;
  speed: number;
  tier: number;
  attackAt: number;
};
export type CastleEvent = {
  kind:
    | 'correct'
    | 'wrong'
    | 'spawn'
    | 'clash'
    | 'castle'
    | 'arrow'
    | 'shield'
    | 'tier'
    | 'end'
    | 'question';
  side?: Side;
  x?: number;
  value?: number;
  tier?: number;
  at: number;
};
export const TIERS = [
  { name: 'Momo', hp: 18, power: 7, speed: 90 },
  { name: 'Momo chiến binh', hp: 28, power: 10, speed: 104 },
  { name: 'Momo tinh nhuệ', hp: 42, power: 15, speed: 125 },
  { name: 'Momo thần tướng', hp: 65, power: 22, speed: 138 },
];
export const BOT = {
  easy: { accuracy: 0.58, min: 2300, max: 5400 },
  normal: { accuracy: 0.76, min: 1400, max: 3800 },
  hard: { accuracy: 0.91, min: 750, max: 2400 },
};
export const LEFT_GATE = 130,
  RIGHT_GATE = 1070,
  MAX_MATCH_MS = 180000,
  MAX_QUESTIONS = 60;
export const tierFor = (combo: number) =>
  combo >= 10 ? 3 : combo >= 5 ? 2 : combo >= 3 ? 1 : 0;

// Luật độc lập với React, âm thanh và đồng hồ thiết bị để kiểm thử chính xác.
export class CastleBattle {
  visualStartedAt = 0;
  visualFrom = new Map<number, number>();
  visualX(troop: Troop, time: number) {
    if (this.config.mode !== 'online') return troop.x;
    const from = this.visualFrom.get(troop.id) ?? troop.x;
    return (
      from +
      (troop.x - from) *
        Math.max(0, Math.min(1, (time - this.visualStartedAt) / 250))
    );
  }
  phase: 'countdown' | 'battle' | 'ending' | 'finished' = 'countdown';
  now = 0;
  paused = false;
  round = 0;
  deadline = 0;
  startedAt = 0;
  finishedAt = 0;
  resolutionAt: number | null = null;
  question: CastleQuestion | null = null;
  players: [Commander, Commander];
  troops: Troop[] = [];
  events: CastleEvent[] = [];
  mistakes: [Map<string, CastleWord>, Map<string, CastleWord>] = [
    new Map(),
    new Map(),
  ];
  winner: Side | null = null;
  reason = '';
  hitStopUntil = 0;
  private endingAt = 0;
  private nextTroop = 0;
  private bag: CastleWord[] = [];
  private kinds: QuestionKind[] = [];
  private aiAt = Infinity;
  private aiChoice = 0;
  private aiSkillAt = 0;
  private targets: CastleWord[];
  constructor(public config: CastleConfig, private random = Math.random) {
    if (config.words.length < 4)
      throw new Error('Cần ít nhất 4 từ để bắt đầu.');
    const kinds: QuestionKind[] = ['reading', 'kanji', 'meaning', 'reverse'];
    this.targets = (config.targets || config.words).filter(word =>
      kinds.every(kind => {
        try {
          makeQuestion(word, config.words, 0, kind, () => 0.5);
          return true;
        } catch {
          return false;
        }
      }),
    );
    if (!this.targets.length)
      throw new Error('Bộ từ chưa đủ đáp án khác nhau cho cả 4 dạng câu hỏi.');
    const player = (name: string): Commander => ({
      name,
      hp: 100,
      energy: 0,
      combo: 0,
      bestCombo: 0,
      correct: 0,
      wrong: 0,
      missed: 0,
      responses: [],
      shieldUntil: 0,
      cooldownUntil: 0,
      choice: null,
    });
    this.players = [player(config.names[0]), player(config.names[1])];
  }
  get elapsed() {
    return this.phase === 'countdown'
      ? 0
      : Math.min(
          MAX_MATCH_MS,
          Math.max(0, (this.finishedAt || this.now) - this.startedAt),
        );
  }
  get remaining() {
    return Math.max(0, MAX_MATCH_MS - this.elapsed);
  }
  private emit(event: Omit<CastleEvent, 'at'>) {
    this.events.push({ ...event, at: this.now });
    if (this.events.length > 150) this.events.shift();
  }
  drainEvents() {
    return this.events.splice(0);
  }
  private nextQuestion() {
    if (this.round >= MAX_QUESTIONS) {
      this.finish('Đã hoàn thành 60 câu');
      return;
    }
    if (!this.bag.length) this.bag = shuffled(this.targets, this.random);
    if (!this.kinds.length)
      this.kinds = shuffled<QuestionKind>(
        ['reading', 'kanji', 'meaning', 'reverse'],
        this.random,
      );
    this.round++;
    this.question = makeQuestion(
      this.bag.pop()!,
      this.config.words,
      this.round,
      this.kinds.pop()!,
      this.random,
    );
    this.deadline = this.now + this.config.roundSeconds * 1000;
    this.resolutionAt = null;
    this.players.forEach(player => {
      player.choice = null;
    });
    const ai = BOT[this.config.difficulty];
    this.aiAt = this.now + ai.min + this.random() * (ai.max - ai.min);
    const wrong = [0, 1, 2, 3].filter(
      index => index !== this.question!.correct,
    );
    this.aiChoice =
      this.random() < ai.accuracy
        ? this.question.correct
        : wrong[Math.floor(this.random() * wrong.length)];
    this.emit({ kind: 'question' });
  }
  answer(side: Side, index: number, questionId: number) {
    const player = this.players[side],
      question = this.question;
    if (
      this.paused ||
      this.phase !== 'battle' ||
      !question ||
      question.id !== questionId ||
      player.choice ||
      this.now >= this.deadline ||
      this.now < player.cooldownUntil ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 3
    )
      return false;
    const correct = index === question.correct;
    player.choice = { index, correct };
    player.responses.push(
      this.now - (this.deadline - this.config.roundSeconds * 1000),
    );
    if (correct) {
      player.correct++;
      player.combo++;
      player.bestCombo = Math.max(player.bestCombo, player.combo);
      player.energy = Math.min(100, player.energy + 22);
      const tier = tierFor(player.combo),
        spec = TIERS[tier];
      const bonus =
        1 +
        Math.max(
          0,
          1 -
            player.responses[player.responses.length - 1] /
              (this.config.roundSeconds * 1000),
        ) *
          0.28;
      this.troops.push({
        id: ++this.nextTroop,
        side,
        x: side === 0 ? LEFT_GATE : RIGHT_GATE,
        hp: spec.hp * bonus,
        maxHp: spec.hp * bonus,
        power: Math.round(spec.power * bonus),
        speed: spec.speed * bonus,
        tier,
        attackAt: this.now,
      });
      this.emit({ kind: 'correct', side });
      this.emit({
        kind: 'spawn',
        side,
        x: side === 0 ? LEFT_GATE : RIGHT_GATE,
        tier,
      });
      if ([3, 5, 10].includes(player.combo))
        this.emit({ kind: 'tier', side, tier, value: player.combo });
    } else {
      player.wrong++;
      player.combo = 0;
      player.cooldownUntil = this.now + 1000;
      this.mistakes[side].set(question.word.id, question.word);
      this.emit({ kind: 'wrong', side });
    }
    if (this.players.every(p => p.choice)) this.resolutionAt = this.now + 1000;
    return true;
  }
  skill(side: Side, kind: 'arrow' | 'shield') {
    const player = this.players[side];
    if (this.paused || this.phase !== 'battle' || player.energy < 100)
      return false;
    player.energy = 0;
    if (kind === 'shield') {
      player.shieldUntil = this.now + 5000;
      this.emit({ kind: 'shield', side });
    } else {
      this.troops
        .filter(troop => troop.side !== side)
        .forEach(troop => {
          troop.hp -= 24;
        });
      this.troops = this.troops.filter(troop => troop.hp > 0);
      this.emit({ kind: 'arrow', side });
    }
    return true;
  }
  private expireAnswers() {
    for (const side of [0, 1] as const) {
      const player = this.players[side];
      if (!player.choice) {
        player.choice = { index: null, correct: false, timeout: true };
        player.wrong++;
        player.missed++;
        player.combo = 0;
        if (this.question)
          this.mistakes[side].set(this.question.word.id, this.question.word);
      }
    }
    this.resolutionAt = this.now + 1000;
  }
  private physics(dt: number) {
    const alive = this.troops.filter(troop => troop.hp > 0);
    const previous = new Map(alive.map(troop => [troop.id, troop.x]));
    for (const troop of alive) {
      const direction = troop.side === 0 ? 1 : -1;
      let next = troop.x + (direction * troop.speed * dt) / 1000;
      for (const enemy of alive) {
        if (enemy.side === troop.side) continue;
        const enemyX = previous.get(enemy.id)!;
        if (direction * (enemyX - previous.get(troop.id)!) < 0) continue;
        next =
          direction === 1
            ? Math.min(next, enemyX - 28)
            : Math.max(next, enemyX + 28);
      }
      troop.x = Math.max(LEFT_GATE, Math.min(RIGHT_GATE, next));
    }
    const left = alive.filter(t => t.side === 0).sort((a, b) => b.x - a.x);
    const right = alive.filter(t => t.side === 1).sort((a, b) => a.x - b.x);
    const engaged = new Set<number>();
    for (const a of left)
      for (const b of right) {
        if (
          a.hp <= 0 ||
          b.hp <= 0 ||
          engaged.has(a.id) ||
          engaged.has(b.id) ||
          Math.abs(a.x - b.x) > 29
        )
          continue;
        engaged.add(a.id);
        engaged.add(b.id);
        const center = (a.x + b.x) / 2;
        a.x = center - 14;
        b.x = center + 14;
        // Hai đòn cùng nhịp gây sát thương đồng thời, không ưu tiên phe trái.
        const damageA = this.now >= a.attackAt ? a.power : 0,
          damageB = this.now >= b.attackAt ? b.power : 0;
        a.hp -= damageB;
        b.hp -= damageA;
        if (damageA) a.attackAt = this.now + 430;
        if (damageB) b.attackAt = this.now + 430;
        if (damageA || damageB) {
          this.emit({
            kind: 'clash',
            x: center,
            value: Math.max(damageA, damageB),
          });
          this.hitStopUntil = this.now + 50;
        }
      }
    const damage = [0, 0];
    for (const troop of alive) {
      if (troop.hp <= 0) continue;
      const target: Side = troop.side === 0 ? 1 : 0;
      if (
        (troop.side === 0 && troop.x >= RIGHT_GATE) ||
        (troop.side === 1 && troop.x <= LEFT_GATE)
      ) {
        const amount =
          this.players[target].shieldUntil > this.now ? 0 : troop.power;
        damage[target] += amount;
        troop.hp = 0;
        this.emit({
          kind: 'castle',
          side: target,
          x: target === 0 ? LEFT_GATE : RIGHT_GATE,
          value: amount,
        });
      }
    }
    this.players.forEach((player, index) => {
      player.hp = Math.max(0, player.hp - damage[index]);
    });
    this.troops = alive.filter(troop => troop.hp > 0);
    if (this.players.some(player => player.hp === 0))
      this.finish('Lâu đài đã thất thủ');
  }
  private finish(reason: string) {
    if (this.phase === 'ending' || this.phase === 'finished') return;
    this.finishedAt = this.now;
    this.reason = reason;
    this.winner =
      this.players[0].hp === this.players[1].hp
        ? null
        : this.players[0].hp > this.players[1].hp
        ? 0
        : 1;
    this.phase = 'ending';
    this.endingAt = this.now + 1000;
    this.emit({
      kind: 'end',
      side: this.winner === null ? undefined : this.winner,
    });
  }
  update(milliseconds: number) {
    if (
      this.paused ||
      this.phase === 'finished' ||
      !Number.isFinite(milliseconds) ||
      milliseconds <= 0
    )
      return;
    let remaining = Math.min(milliseconds, 240000);
    // Bước nhỏ cố định ngăn lính xuyên nhau khi thiết bị có frame chậm.
    while (remaining > 0 && this.phase !== 'finished') {
      const dt = Math.min(20, remaining);
      remaining -= dt;
      this.now += dt;
      if (this.phase === 'countdown') {
        if (this.now >= 3000) {
          this.phase = 'battle';
          this.startedAt = this.now;
          this.nextQuestion();
        }
        continue;
      }
      if (this.phase === 'ending') {
        this.troops.forEach(t => {
          t.x += ((t.side === 0 ? 1 : -1) * t.speed * dt) / 10000;
        });
        if (this.now >= this.endingAt) this.phase = 'finished';
        continue;
      }
      if (this.elapsed >= MAX_MATCH_MS) {
        this.finish('Hết thời gian');
        continue;
      }
      if (this.resolutionAt !== null && this.now >= this.resolutionAt)
        this.nextQuestion();
      if (this.phase !== 'battle') continue;
      if (this.resolutionAt === null && this.now >= this.deadline)
        this.expireAnswers();
      if (this.config.mode === 'bot' && this.now >= this.aiAt) {
        this.aiAt = Infinity;
        this.answer(1, this.aiChoice, this.question!.id);
      }
      if (
        this.config.mode === 'bot' &&
        this.players[1].energy >= 100 &&
        this.now >= this.aiSkillAt
      ) {
        this.aiSkillAt = this.now + 1700;
        if (this.players[1].hp < 40) this.skill(1, 'shield');
        else if (this.troops.filter(t => t.side === 0).length >= 2)
          this.skill(1, 'arrow');
      }
      if (this.now >= this.hitStopUntil) this.physics(dt);
    }
  }
}
