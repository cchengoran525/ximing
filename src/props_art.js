// 道具 / 载具 / 摄像头的绘制（游戏与素材导出脚本共用）
import { drawSpr } from './sprites.js';
import { text } from './utils.js';

// 绘制单个交互道具。opts: { time, stock, player, contracted, destLevel }
export function drawPropAt(ctx, prop, opts = {}) {
  const time = opts.time || 0;
  const x = prop.x, y = prop.y;
  if (prop.type === 'chest') {
    drawSpr(ctx, 'chest', x, y);
  } else if (prop.type === 'vend') {
    drawSpr(ctx, 'vend', x, y);
    const stock = opts.stock;
    const pl = opts.player;
    if (stock && pl && Math.hypot(x - pl.x, y - pl.y) < 120) {
      stock.forEach((s, i) => {
        if (s.sold) return;
        const col = s.kind === 'weapon' ? '#c9c9c9' : s.kind === 'heal' ? '#6ac07a' : s.kind === 'skill' ? '#6fe8e0' : '#b070e0';
        ctx.fillStyle = col;
        ctx.fillRect(x - 16, y - 26 + i * 6, 3, 3);
        text(ctx, '' + s.price, x - 11, y - 28 + i * 6, { size: 7, color: '#e8c14a' });
      });
    }
  } else if (prop.type === 'bench') {
    // 合成台：铁砧式工作台
    ctx.fillStyle = '#5d4a30'; ctx.fillRect(x - 18, y - 5, 36, 13);
    ctx.fillStyle = '#6e5a3c'; ctx.fillRect(x - 18, y - 5, 36, 4);
    ctx.fillStyle = '#2e2620'; ctx.fillRect(x - 14, y + 8, 5, 6); ctx.fillRect(x + 9, y + 8, 5, 6);
    ctx.fillStyle = '#3a3f46'; ctx.fillRect(x - 9, y - 16, 18, 11);
    ctx.fillStyle = '#8d939c'; ctx.fillRect(x - 7, y - 14, 14, 6);
    ctx.fillStyle = '#e8c14a'; ctx.fillRect(x + 12, y - 12, 4, 7);
    if (time % 1 < 0.5) { ctx.fillStyle = 'rgba(232,193,85,0.5)'; ctx.fillRect(x - 3, y - 20, 2, 2); }
  } else if (prop.type === 'board') {
    // 通缉板
    ctx.fillStyle = '#3a2f20'; ctx.fillRect(x - 17, y - 26, 34, 30);
    ctx.fillStyle = '#4a3c28'; ctx.fillRect(x - 15, y - 24, 30, 26);
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(x - 12, y - 21, 10, 13);
    ctx.fillStyle = '#8c3038'; ctx.fillRect(x - 11, y - 19, 8, 2);
    ctx.fillStyle = '#6a6a78'; ctx.fillRect(x - 11, y - 15, 7, 1); ctx.fillRect(x - 11, y - 13, 8, 1);
    ctx.fillStyle = '#c8b8a8'; ctx.fillRect(x + 1, y - 17, 10, 9);
    if (opts.contracted) {
      ctx.fillStyle = '#6ac07a';
      ctx.fillRect(x + 2, y - 15, 8, 2);
      ctx.fillRect(x + 2, y - 11, 6, 1);
    } else {
      ctx.fillStyle = '#8a8a98';
      ctx.fillRect(x + 2, y - 15, 8, 1); ctx.fillRect(x + 2, y - 12, 6, 1);
    }
  } else if (prop.type === 'stairs') {
    const down = opts.destLevel === 1;
    ctx.fillStyle = '#3a3f46'; ctx.fillRect(x - 12, y - 10, 24, 20);
    ctx.fillStyle = '#4d545e';
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 10, y - 8 + i * 5, 20, 3);
    ctx.fillStyle = down ? '#6fe8e0' : '#e8c14a';
    ctx.beginPath();
    if (down) { ctx.moveTo(x + 15, y - 3); ctx.lineTo(x + 21, y + 3); ctx.lineTo(x + 9, y + 3); }
    else { ctx.moveTo(x + 15, y + 3); ctx.lineTo(x + 21, y - 3); ctx.lineTo(x + 9, y - 3); }
    ctx.closePath(); ctx.fill();
  } else if (prop.type === 'elevator') {
    // 电梯门 + 上下指示灯
    ctx.fillStyle = '#57606a'; ctx.fillRect(x - 12, y - 12, 24, 24);
    ctx.fillStyle = '#39414a'; ctx.fillRect(x - 10, y - 10, 9, 20); ctx.fillRect(x + 1, y - 10, 9, 20);
    const blink = Math.sin(time * 4) > 0;
    ctx.fillStyle = blink ? '#6fe8e0' : '#2a4a50';
    ctx.fillRect(x - 6, y - 16, 5, 3);
    ctx.fillStyle = blink ? '#2a4a50' : '#e8c14a';
    ctx.fillRect(x + 1, y - 16, 5, 3);
  } else if (prop.type === 'manhole') {
    ctx.fillStyle = '#2e3238';
    ctx.beginPath(); ctx.ellipse(x, y, 11, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#4a5058';
    ctx.beginPath(); ctx.ellipse(x - 3, y - 2, 9, 6, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#6a7078'; ctx.beginPath(); ctx.ellipse(x - 3, y - 2, 9, 6, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(10,10,14,0.75)';
    ctx.beginPath(); ctx.ellipse(x + 4, y + 1, 5, 4, 0, 0, 7); ctx.fill();
  } else if (prop.type === 'overpass') {
    ctx.fillStyle = '#3a3f46'; ctx.fillRect(x - 14, y - 4, 28, 8);
    ctx.fillStyle = '#4d545e';
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 12 + i * 5, y - 6, 3, 12);
    ctx.fillStyle = '#2e3a52'; ctx.fillRect(x - 10, y - 18, 20, 8);
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(x - 8, y - 15, 12, 1); ctx.fillRect(x - 8, y - 13, 8, 1);
  } else if (prop.type === 'portal') {
    const t = time * 3;
    ctx.strokeStyle = '#6fe8e0';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.5 - i * 0.13;
      ctx.beginPath();
      ctx.arc(x, y, 10 + i * 5 + Math.sin(t + i) * 2, t + i, t + i + 4.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (prop.type === 'note') {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * 2) * 0.1);
    ctx.fillStyle = '#d8d0c0';
    ctx.fillRect(-4, -5, 8, 10);
    ctx.fillStyle = '#6a6a78';
    ctx.fillRect(-2, -3, 4, 1); ctx.fillRect(-2, -1, 4, 1); ctx.fillRect(-2, 1, 3, 1);
    ctx.restore();
  } else if (prop.type === 'story') {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * 1.6) * 0.06);
    ctx.fillStyle = prop.read ? '#8a8a92' : '#e8e4da';
    ctx.fillRect(-5, -6, 10, 12);
    ctx.fillStyle = '#4a4a54';
    ctx.fillRect(-4, -5, 8, 8);
    ctx.fillStyle = prop.read ? '#6a6a72' : '#c8a04a';
    ctx.fillRect(-3, -4, 6, 5);
    ctx.fillStyle = prop.read ? 'rgba(106,106,120,0.5)' : 'rgba(232,193,85,0.55)';
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
  }
}

// 载具车体（以中心为原点，朝 +x 方向绘制）
export function drawVehicleBody(ctx, kind, w, cars = 4) {
  const seg = 26;
  if (kind === 'train') {
    const n = cars;
    const head = w / 2 - 13;
    for (let i = 0; i < n; i++) {
      const bx = head - i * seg;
      const engine = i === 0;
      const tender = i === 1;
      ctx.fillStyle = engine ? '#5a3a3a' : tender ? '#4a4048' : '#38404a';
      ctx.fillRect(bx - 13, -9, 26, 18);
      ctx.fillStyle = '#151a22';
      ctx.fillRect(bx - 10, -7, 6, 6); ctx.fillRect(bx - 10, 1, 6, 6);
      if (i % 2 === 0) { ctx.fillRect(bx + 1, -7, 6, 6); ctx.fillRect(bx + 1, 1, 6, 6); }
      ctx.fillStyle = '#8c2f3a';
      ctx.fillRect(bx - 13, -1, 26, 3);
      ctx.fillStyle = '#2a2f38';
      ctx.fillRect(bx - 13, 8, 26, 2);
      if (engine) {
        ctx.fillStyle = '#e8c14a';
        ctx.fillRect(bx + 9, -6, 3, 4); ctx.fillRect(bx + 9, 2, 3, 4);
        ctx.fillStyle = '#20161a';
        ctx.fillRect(bx + 11, -8, 3, 5);
      }
      if (i < n - 1) { ctx.fillStyle = '#1a1e26'; ctx.fillRect(bx - 14, -4, 2, 8); }
    }
  } else if (kind === 'truck') {
    ctx.fillStyle = '#3a4450'; ctx.fillRect(-21, -8, 42, 16);
    ctx.fillStyle = '#8a9aa8'; ctx.fillRect(-17, -6, 22, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-16, -5, 20, 10);
    ctx.fillStyle = '#1a1c26'; ctx.fillRect(8, -6, 12, 12);
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(-18, 5, 8, 4); ctx.fillRect(8, 5, 8, 4);
  } else {
    ctx.fillStyle = '#7a3a38';
    ctx.fillRect(-14, -7, 28, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-10, -4, 15, 8);
    ctx.fillStyle = '#151a22'; ctx.fillRect(-12, -5, 8, 10);
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(-16, -2, 3, 4); ctx.fillRect(13, -2, 3, 4);
  }
  ctx.fillStyle = '#f2e8c0';
  ctx.fillRect(w / 2 - 2, -6, 2, 3); ctx.fillRect(w / 2 - 2, 3, 2, 3);
}

// 摄像头机身（不含视野扇形）
export function drawCameraBody(ctx, x, y, alert = false) {
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(x - 4, y - 4, 8, 6);
  ctx.fillStyle = alert ? '#e05540' : '#6fe8e0';
  ctx.fillRect(x - 3, y - 6, 6, 3);
  ctx.fillStyle = '#2a2f38';
  ctx.fillRect(x - 1, y + 2, 2, 4);
}
