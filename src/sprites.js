// 像素表 → 离屏画布。缓存后重复使用。
import { ART } from './art.js';

const cache = new Map();

export function spr(name) {
  let c = cache.get(name);
  if (!c) {
    const def = ART[name];
    if (!def) throw new Error('no sprite: ' + name);
    const rows = def.rows;
    const w = Math.max(...rows.map(r => r.length));
    const h = rows.length;
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const col = def.pal[row[x]];
        if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
      }
    }
    cache.set(name, c);
  }
  return c;
}

export function sprW(name) { return spr(name).width; }
export function sprH(name) { return spr(name).height; }

// 以 (x,y) 为中心绘制，支持翻转/旋转/缩放
export function drawSpr(ctx, name, x, y, { flip = false, rot = 0, scale = 1, alpha = 1, ax = 0.5, ay = 0.5 } = {}) {
  const c = spr(name);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  if (flip) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, -c.width * ax, -c.height * ay);
  ctx.restore();
}

// 受击白闪：绘制纯白剪影
const tmpCv = document.createElement('canvas');
const tmpCtx = tmpCv.getContext('2d');
export function drawFlash(ctx, name, x, y, opts = {}) {
  const c = spr(name);
  if (tmpCv.width < c.width || tmpCv.height < c.height) { tmpCv.width = Math.max(64, c.width); tmpCv.height = Math.max(64, c.height); }
  tmpCtx.clearRect(0, 0, tmpCv.width, tmpCv.height);
  tmpCtx.imageSmoothingEnabled = false;
  tmpCtx.drawImage(c, 0, 0);
  tmpCtx.globalCompositeOperation = 'source-atop';
  tmpCtx.fillStyle = '#ffffff';
  tmpCtx.fillRect(0, 0, c.width, c.height);
  tmpCtx.globalCompositeOperation = 'source-over';
  const { flip = false, rot = 0, scale = 1, alpha = 1, ax = 0.5, ay = 0.5 } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(tmpCv, 0, 0, c.width, c.height, -c.width * ax, -c.height * ay, c.width, c.height);
  ctx.restore();
}
