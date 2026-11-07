import { colors } from '../../theme/theme';
import { momoSpriteFrame } from './spriteFrame';
import { CastleBattle, CastleEvent, Side } from './engine';
const teams = [
  {
    main: colors.primary,
    light: colors.primaryEnd,
    dark: colors.focus,
    metal: colors.badgeBg,
  },
  {
    main: colors.focus,
    light: colors.border,
    dark: colors.body,
    metal: colors.surfaceTint,
  },
];
type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  label?: string;
  arrow?: boolean;
};

// Vẽ cảnh tại thiết bị, không tải sprite hay gọi dịch vụ bên ngoài.
export class CastlePainter {
  private momo: HTMLImageElement | null = null;
  setMomo(image: HTMLImageElement) {
    this.momo = image;
  }
  private sparks: Spark[] = [];
  private hits = [0, 0];
  private last = 0;
  constructor(private context: CanvasRenderingContext2D) {}
  effects(events: CastleEvent[]) {
    for (const event of events) {
      if (event.kind === 'castle' && event.side !== undefined)
        this.hits[event.side] = event.at + 350;
      const x = event.x ?? (event.side === 1 ? 1070 : 130);
      if (event.kind === 'correct' || event.kind === 'wrong') {
        this.sparks.push({
          x: event.side === 1 ? 910 : 290,
          y: 170,
          vx: 0,
          vy: -28,
          life: 0,
          max: 900,
          color: event.kind === 'correct' ? colors.success : colors.danger,
          label: event.kind === 'correct' ? 'TUYỆT VỜI!' : 'Chưa đúng',
        });
      }
      if (
        ['clash', 'spawn', 'castle', 'tier', 'end', 'arrow'].includes(
          event.kind,
        )
      ) {
        const count =
          event.kind === 'end' ? 90 : event.kind === 'arrow' ? 28 : 16;
        for (let n = 0; n < count; n++)
          this.sparks.push({
            x:
              event.kind === 'end' || event.kind === 'arrow'
                ? Math.random() * 1200
                : x,
            y: event.kind === 'arrow' ? Math.random() * 80 : 255,
            vx: (Math.random() - 0.5) * 160,
            vy: event.kind === 'arrow' ? 270 : -Math.random() * 120 - 30,
            arrow: event.kind === 'arrow',
            life: 0,
            max: event.kind === 'end' ? 2400 : 850,
            color:
              n % 3 === 0
                ? colors.primaryEnd
                : event.side === 1
                ? colors.body
                : colors.primary,
          });
        if (event.value)
          this.sparks.push({
            x,
            y: 240,
            vx: 0,
            vy: -38,
            life: 0,
            max: 900,
            color: colors.focus,
            label:
              event.kind === 'tier'
                ? `COMBO ×${event.value}`
                : `−${event.value}`,
          });
      }
    }
    this.sparks = this.sparks.slice(-300);
  }
  render(
    width: number,
    height: number,
    time: number,
    battle: CastleBattle | null,
    reduced = false,
  ) {
    const c = this.context,
      dt = Math.min(50, time - this.last);
    this.last = time;
    c.clearRect(0, 0, width, height);
    const sky = c.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, colors.surfaceTint);
    sky.addColorStop(0.45, colors.badgeBg);
    sky.addColorStop(0.8, colors.surfaceTint);
    sky.addColorStop(1, colors.background);
    c.fillStyle = sky;
    c.fillRect(0, 0, width, height);
    const sx = width / 1200,
      sy = height / 360,
      ground = height * 0.81;
    // Mặt trời, núi Phú Sĩ và các lớp mây, đồi chuyển động khác tốc độ.
    c.fillStyle = colors.primaryEnd;
    c.shadowColor = colors.primary;
    c.shadowBlur = 35;
    c.beginPath();
    c.arc(width * 0.52, height * 0.33, height * 0.15, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    const mountain = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: string,
    ) => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(x - w / 2, y);
      c.lineTo(x, y - h);
      c.lineTo(x + w / 2, y);
      c.fill();
    };
    mountain(
      width * 0.53,
      height * 0.72,
      width * 0.55,
      height * 0.42,
      '#e7d3bd',
    );
    c.fillStyle = colors.surface;
    c.beginPath();
    c.moveTo(width * 0.53, height * 0.3);
    c.lineTo(width * 0.46, height * 0.4);
    c.lineTo(width * 0.505, height * 0.386);
    c.lineTo(width * 0.53, height * 0.415);
    c.lineTo(width * 0.555, height * 0.383);
    c.lineTo(width * 0.6, height * 0.4);
    c.fill();
    for (let layer = 0; layer < 3; layer++) {
      for (let n = 0; n < 5; n++) {
        const drift = reduced ? 0 : time * (0.002 + layer * 0.001);
        const x =
          ((n * width * 0.29 + layer * 80 + drift) % (width + 240)) - 120;
        c.fillStyle = `rgba(255,255,255,${0.45 + layer * 0.1})`;
        c.beginPath();
        c.ellipse(
          x,
          height * (0.14 + layer * 0.11),
          70 + layer * 25,
          8 + layer * 3,
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      c.fillStyle = ['#f0ddcb', '#ead7c3', '#decbba'][layer];
      c.beginPath();
      c.moveTo(0, ground);
      for (let x = 0; x <= width + 30; x += 30)
        c.lineTo(
          x,
          height * (0.67 + layer * 0.055) +
            Math.sin(x / (60 + layer * 30) + layer) * height * 0.035,
        );
      c.lineTo(width, height);
      c.lineTo(0, height);
      c.fill();
    }
    const road = c.createLinearGradient(0, ground, 0, height);
    road.addColorStop(0, colors.border);
    road.addColorStop(0.3, colors.track);
    road.addColorStop(1, colors.surfaceTint);
    c.fillStyle = road;
    c.fillRect(0, ground, width, height - ground);
    c.strokeStyle = colors.border;
    c.lineWidth = 1;
    for (let n = 0; n < 30; n++) {
      const x = (n * 89) % width;
      c.beginPath();
      c.moveTo(x, ground + 12 + (n % 4) * 9);
      c.lineTo(x + 8, ground + 14 + (n % 4) * 9);
      c.stroke();
    }
    const size =
      Math.max(0.42, Math.min(1, width / 1000)) * Math.pow(height / 300, 0.25);
    for (const side of [0, 1] as const) {
      const player = battle?.players[side];
      const x = (side === 0 ? 95 : 1105) * sx;
      c.save();
      c.translate(x, ground);
      c.scale(size, size);
      if (!reduced && battle && this.hits[side] > battle.now)
        c.translate(Math.sin(time * 0.07) * 4, Math.cos(time * 0.12) * 2);
      if (player?.hp === 0 && battle) {
        c.rotate(
          (side === 0 ? -0.1 : 0.1) *
            Math.min(1, (battle.now - battle.finishedAt) / 700),
        );
        c.globalAlpha = 0.45;
      }
      this.castle(side, player?.hp ?? 100, time, reduced);
      c.restore();
      if (player && player.shieldUntil > battle!.now) {
        c.strokeStyle = colors.primary;
        c.fillStyle = colors.badgeBg;
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(x, ground - 55 * size, 72 * size, 95 * size, 0, Math.PI, 0);
        c.fill();
        c.stroke();
      }
    }
    if (battle) {
      for (const troop of battle.troops) {
        c.save();
        c.translate(battle.visualX(troop, time) * sx, ground + 3 + (troop.id % 3) * 3);
        c.scale(size * (troop.side === 0 ? 1 : -1), size);
        this.momoFighter(
          troop.side,
          troop.tier,
          time,
          troop.hp / troop.maxHp,
          reduced,
        );
        c.restore();
      }
    } else {
      // Cảnh động ở menu không bắt đầu trận hay tạo điểm.
      for (const side of [0, 1] as const) {
        c.save();
        c.translate((side === 0 ? 330 : 870) * sx, ground + 5);
        c.scale(size * 1.3 * (side === 0 ? 1 : -1), size * 1.3);
        this.momoFighter(side, 1, time, 1, reduced);
        c.restore();
      }
    }
    if (!reduced) {
      for (let n = 0; n < 25; n++) {
        const t = time * 0.00007 + n * 2.399;
        const x = ((n * 71 + time * 0.014) % (width + 30)) - 15;
        const y =
          ((n * 37 + time * (0.008 + (n % 3) * 0.002)) % (height + 30)) - 15;
        c.save();
        c.translate(x + Math.sin(t) * 10, y);
        c.rotate(t);
        c.fillStyle = n % 2 ? '#ffd7df9c' : '#F9CCD680';
        c.beginPath();
        c.ellipse(0, 0, 3, 1.8, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }
    this.sparks = this.sparks.filter(p => p.life < p.max);
    for (const p of this.sparks) {
      p.life += dt;
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.vy += (75 * dt) / 1000;
      if (reduced) continue;
      c.globalAlpha = 1 - p.life / p.max;
      c.fillStyle = p.color;
      if (p.label) {
        c.font = 'bold 16px sans-serif';
        c.textAlign = 'center';
        c.fillText(p.label, p.x * sx, p.y * sy);
      } else if (p.arrow) {
        c.strokeStyle = p.color;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(p.x * sx - 5, p.y * sy - 16);
        c.lineTo(p.x * sx, p.y * sy);
        c.lineTo(p.x * sx - 4, p.y * sy - 4);
        c.moveTo(p.x * sx, p.y * sy);
        c.lineTo(p.x * sx + 2, p.y * sy - 6);
        c.stroke();
      } else {
        c.save();
        c.translate(p.x * sx, p.y * sy);
        c.rotate(p.life * 0.01);
        c.fillRect(-2, -2, 4, 4);
        c.restore();
      }
    }
    c.globalAlpha = 1;
  }
  private castle(side: Side, hp: number, time: number, reduced: boolean) {
    const c = this.context,
      t = teams[side];
    c.fillStyle = '#11182740';
    c.beginPath();
    c.ellipse(0, 1, 80, 13, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#504555';
    c.beginPath();
    c.moveTo(-63, 0);
    c.lineTo(-49, -36);
    c.lineTo(49, -36);
    c.lineTo(63, 0);
    c.fill();
    c.strokeStyle = '#b7a0a04d';
    c.lineWidth = 1;
    for (let row = 0; row < 3; row++)
      for (let n = 0; n < 5; n++)
        c.strokeRect(-49 + n * 20 + (row % 2) * 5, -29 + row * 10, 18, 9);
    const roof = (y: number, w: number) => {
      c.fillStyle = t.dark;
      c.strokeStyle = t.metal;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-w / 2 - 8, y + 7);
      c.quadraticCurveTo(-w / 2 + 5, y + 3, -w / 2 + 10, y - 9);
      c.lineTo(w / 2 - 10, y - 9);
      c.quadraticCurveTo(w / 2 - 5, y + 3, w / 2 + 8, y + 7);
      c.quadraticCurveTo(0, y + 12, -w / 2 - 8, y + 7);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = '#ffffff16';
      c.lineWidth = 1;
      for (let x = -w / 2 + 12; x < w / 2 - 8; x += 9) {
        c.beginPath();
        c.moveTo(x, y - 7);
        c.lineTo(x * 1.06, y + 6);
        c.stroke();
      }
    };
    for (let floor = 0; floor < 3; floor++) {
      const y = -34 - floor * 36,
        w = 90 - floor * 20;
      c.fillStyle = floor % 2 ? t.light : '#f9e7c9';
      c.fillRect(-w / 2, y - 33, w, 34);
      c.fillStyle = t.main;
      c.fillRect(-w / 2, y - 6, w, 6);
      for (let n = -1; n <= 1; n++) {
        c.fillStyle = t.dark;
        c.fillRect(n * 16 - 4, y - 26, 8, 12);
        c.strokeStyle = t.metal;
        c.strokeRect(n * 16 - 4, y - 26, 8, 12);
      }
      roof(y - 34, w + 21);
    }
    c.fillStyle = '#1c263c';
    c.beginPath();
    c.roundRect(-12, -26, 24, 28, [12, 12, 0, 0]);
    c.fill();
    c.strokeStyle = t.metal;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -153);
    c.lineTo(0, -188);
    c.stroke();
    const wave = reduced ? 0 : Math.sin(time * 0.003 + side) * 4;
    c.fillStyle = t.main;
    c.beginPath();
    c.moveTo(0, -185);
    c.bezierCurveTo(12, -190 + wave, 24, -180 - wave, 32, -185);
    c.lineTo(32, -167);
    c.bezierCurveTo(21, -163 - wave, 10, -176 + wave, 0, -167);
    c.fill();
    c.fillStyle = t.metal;
    c.beginPath();
    c.arc(15, -176, 4, 0, Math.PI * 2);
    c.fill();
    for (const x of [-31, 31]) {
      c.shadowColor = '#ffbd77';
      c.shadowBlur = 12;
      c.fillStyle = '#ffb16d';
      c.beginPath();
      c.ellipse(x, -24, 5, 8, 0, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = t.dark;
      c.beginPath();
      c.moveTo(x, -34);
      c.lineTo(x, -15);
      c.stroke();
    }
    if (hp < 65) {
      c.strokeStyle = '#553c48';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-24, -66);
      c.lineTo(-18, -52);
      c.lineTo(-24, -45);
      c.lineTo(-17, -34);
      c.stroke();
    }
    if (hp < 35) {
      for (let n = 0; n < 3; n++) {
        c.fillStyle = n % 2 ? '#ffc666b0' : '#eb7650b0';
        c.beginPath();
        c.ellipse(
          24 + n * 7,
          -42 - Math.sin(time * 0.009 + n) * 4,
          5,
          12 + n * 2,
          -0.2,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
  }
  private momoFighter(
    side: Side,
    tier: number,
    time: number,
    hp: number,
    reduced: boolean,
  ) {
    const c = this.context,
      team = teams[side];
    const stride = reduced ? 0 : Math.sin(time * 0.012);
    const size = 92 + tier * 10;
    c.fillStyle = colors.border;
    c.beginPath();
    c.ellipse(0, 3, size * 0.29, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = team.main;
    c.lineWidth = tier > 0 ? 3 : 2;
    c.beginPath();
    c.ellipse(0, 1, size * 0.31, 7, 0, 0, Math.PI * 2);
    c.stroke();
    if (tier > 0) {
      c.save();
      c.globalAlpha = 0.2;
      c.fillStyle = team.light;
      c.beginPath();
      c.ellipse(0, -size * 0.46, size * 0.43, size * 0.54, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.save();
    c.translate(0, -Math.abs(stride) * 3);
    c.rotate(stride * 0.035);
    if (this.momo) {
      const frame = momoSpriteFrame(
        tier,
        this.momo.naturalWidth,
        this.momo.naturalHeight,
      );
      c.drawImage(
        this.momo,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        -size / 2,
        -size * 0.96,
        size,
        size,
      );
    } else {
      c.fillStyle = team.dark;
      c.font = '12px sans-serif';
      c.textAlign = 'center';
      c.fillText('Momo', 0, -20);
    }
    c.restore();
    // Màu vòng chân và cờ phân biệt hai đội, giữ nguyên artwork Momo.
    c.fillStyle = team.main;
    c.beginPath();
    c.moveTo(-size * 0.4, -size * 0.5);
    c.lineTo(-size * 0.4, -size * 0.8);
    c.lineTo(-size * 0.16, -size * 0.71);
    c.lineTo(-size * 0.4, -size * 0.62);
    c.fill();
    if (tier > 0) {
      c.fillStyle = team.dark;
      c.font = 'bold 12px sans-serif';
      c.textAlign = 'center';
      c.fillText('★'.repeat(tier), 0, -size - 7);
    }
    if (hp < 0.99) {
      c.fillStyle = colors.track;
      c.fillRect(-15, -size - 17, 30, 3);
      c.fillStyle = team.main;
      c.fillRect(-15, -size - 17, 30 * Math.max(0, hp), 3);
    }
  }
}
