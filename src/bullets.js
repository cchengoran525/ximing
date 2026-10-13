// 子弹、粒子、火焰区域、落点预警、爆炸
import { G } from './state.js';
import { solidAtPx, TS, T, setDecal, DESTRUCTIBLE, tileAt } from './world.js';

// 破坏瓦片：扣血 → 碎掉（变体替换 / 爆炸 / 掉落入队由 run 侧消费）
export function damageTile(map, tx, ty, dmg) {
  const t = tileAt(map, tx, ty);
  const def = DESTRUCTIBLE[t];
  if (!def) return false;
  if (!map.hp) map.hp = new Map();
  const i = ty * map.w + tx;
  const hp = (map.hp.has(i) ? map.hp.get(i) : def.hp) - dmg;
  if (hp > 0) {
    map.hp.set(i, hp);
    spawnParts(tx * TS + 8, ty * TS + 8, { n: 3, colors: ['#d8d0c0', '#8a8a92'], spd: 50, life: 0.25, size: 2 });
    return true;
  }
  map.hp.delete(i);
  // 破坏
  map.grid[i] = def.become !== undefined ? def.become : T.FLOOR;
  map.breakQueue = map.breakQueue || [];
  map.breakQueue.push({ x: tx * TS + 8, y: ty * TS + 8, tile: t });
  if (def.explode) {
    explode(tx * TS + 8, ty * TS + 8, def.explode, def.dmg || 10, true);
    // 连环引爆相邻车辆
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (tileAt(map, tx + dx, ty + dy) === T.CAR) {
        setTimeout(() => damageTile(map, tx + dx, ty + dy, 999),
          0);
      }
    }
  } else {
    spawnParts(tx * TS + 8, ty * TS + 8, { n: 10, colors: ['#c9c9c9', '#8a8a92', '#d8d0c0'], spd: 90, life: 0.45, size: 2, grav: 60 });
    sfx('hit_hard');
  }
  return true;
}
import { dist, angleTo, clamp } from './utils.js';
import { sfx } from './audio.js';

export function spawnBullet(o) {
  G.bullets.push({
    x: o.x, y: o.y, vx: o.vx, vy: o.vy,
    dmg: o.dmg || 3, r: o.size || 3, size: o.size || 3,
    ttl: o.ttl || 2.2, t: 0,
    friendly: o.friendly !== false,
    color: o.color || '#f2d98a',
    kind: o.kind || 'bullet',       // bullet laser flame grenade signal plasma arrow homing molotov
    pierce: o.pierce || 0,
    explode: o.explode || 0,
    burn: o.burn || 0,
    knock: o.knock || 0,
    homing: o.homing || 0,
    hit: new Set(),
    z: o.z || 0, vz: o.vz || 0,     // 抛物线（燃烧瓶）
    tx: o.tx, ty: o.ty,             // 抛物线落点
  });
}

export function spawnParts(x, y, { n = 6, colors = ['#fff'], spd = 60, life = 0.4, size = 2, grav = 0, dir = null, spread = Math.PI * 2 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * spread;
    const v = spd * (0.4 + Math.random() * 0.6);
    G.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      t: 0, life: life * (0.6 + Math.random() * 0.8),
      color: colors[Math.floor(Math.random() * colors.length)],
      size: size + (Math.random() < 0.3 ? 1 : 0), grav,
    });
  }
}

export function explode(x, y, rad, dmg, friendly) {
  spawnParts(x, y, { n: 16, colors: ['#f2b05e', '#f2824a', '#d8d4ca'], spd: 130, life: 0.5, size: 3, grav: 40 });
  spawnParts(x, y, { n: 8, colors: ['#8a8a92'], spd: 40, life: 0.9, size: 3 });
  if (G.room && G.room.grid) setDecal(G.room, x, y, T.SCORCH);
  G.shake = Math.max(G.shake, 4);
  sfx('boom');
  if (friendly) {
    for (const e of G.room.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < rad + e.r) e.hurt(dmg * (1 - 0.5 * d / (rad + e.r)), { dir: angleTo(x, y, e.x, e.y) });
    }
  } else {
    if (G.player && !G.player.dead && dist(x, y, G.player.x, G.player.y) < rad + G.player.r) G.player.hurt(dmg);
    if (G.companion && !G.companion.downed && dist(x, y, G.companion.x, G.companion.y) < rad + G.companion.r) G.companion.hurt(dmg);
  }
}

export function addZone(x, y, { r = 20, t = 3, dps = 2, hostile = true, color = '#f2824a' } = {}) {
  G.zones.push({ x, y, r, t, dps, hostile, color, tick: 0 });
}

export function addTelegraph(x, y, r, dur, onDone) {
  G.telegraphs.push({ x, y, r, t: 0, dur, onDone });
}

function impact(b, wall = false) {
  if (b.explode) { explode(b.x, b.y, b.explode, b.dmg, b.friendly); return; }
  spawnParts(b.x, b.y, { n: 4, colors: [b.color, '#d8d4ca'], spd: 50, life: 0.25, size: 2, dir: Math.atan2(-b.vy, -b.vx), spread: 1.2 });
}

export function updateBullets(dt) {
  const B = G.bullets;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    b.t += dt;
    if (b.t > b.ttl) { if (b.kind === 'grenade' || b.kind === 'signal') explode(b.x, b.y, b.explode || 30, b.dmg, b.friendly); B.splice(i, 1); continue; }

    // 燃烧瓶抛物线
    if (b.kind === 'molotov') {
      b.z += b.vz * dt; b.vz -= 260 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.z <= 0) { addZone(b.x, b.y, { r: 22, t: 3.2, dps: 2 }); spawnParts(b.x, b.y, { n: 10, colors: ['#f2824a', '#f2b05e'], spd: 60, life: 0.5 }); B.splice(i, 1); }
      continue;
    }

    // 追踪
    if (b.homing && b.friendly) {
      let best = null, bd = 1e9;
      for (const e of G.room.enemies) {
        if (e.dead || e.spawnT > 0 || b.hit.has(e)) continue;
        const d = dist(b.x, b.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const want = angleTo(b.x, b.y, best.x, best.y);
        const cur = Math.atan2(b.vy, b.vx);
        let d = (want - cur) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        const na = cur + clamp(d, -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }

    // 子步移动 + 撞墙
    const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 5));
    let removed = false;
    const bmaxX = G.room.w * TS - 4, bmaxY = G.room.h * TS - 4;
    for (let s = 0; s < steps && !removed; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (b.x < 4 || b.y < 4 || b.x > bmaxX || b.y > bmaxY || solidAtPx(G.room, b.x, b.y)) {
        const tx = Math.floor(b.x / TS), ty = Math.floor(b.y / TS);
        const t = G.room.grid[ty * G.room.w + tx];
        const def = DESTRUCTIBLE[t];
        if (def && !b.hitTile) {
          damageTile(G.room, tx, ty, Math.max(1, b.dmg));
          if (def.through) continue;      // 玻璃：打碎后子弹继续飞
        }
        impact(b, true);
        B.splice(i, 1); removed = true; break;
      }
    }
    if (removed) continue;

    // 命中判定
    if (b.friendly) {
      // 监控摄像头可被打坏
      const cams = G.room.cameras;
      if (cams) {
        let camHit = null;
        for (const c of cams) {
          if (c.dead || b.hitCam === c) continue;
          if (dist(b.x, b.y, c.x, c.y) < b.r + 7) { camHit = c; break; }
        }
        if (camHit) {
          camHit.hp -= b.dmg;
          camHit.flash = 0.1;
          b.hitCam = camHit;
          sfx('hit');
          if (camHit.hp <= 0) {
            camHit.dead = true;
            spawnParts(camHit.x, camHit.y, { n: 12, colors: ['#6fe8e0', '#8a8a92'], spd: 90, life: 0.5, size: 2, grav: 40 });
            sfx('boom');
            if (G.room.breakQueue) G.room.breakQueue.push({ x: camHit.x, y: camHit.y, tile: 'camera' });
          }
          if (b.pierce > 0) b.pierce--;
          else { B.splice(i, 1); removed = true; }
          if (removed) continue;
        }
      }
      for (const e of G.room.enemies) {
        if (e.dead || e.spawnT > 0 || b.hit.has(e)) continue;
        if (dist(b.x, b.y, e.x, e.y) < b.r + e.r) {
          b.hit.add(e);
          e.hurt(b.dmg, { dir: Math.atan2(b.vy, b.vx), knock: b.knock, burn: b.burn });
          if (b.explode) { explode(b.x, b.y, b.explode, b.dmg, true); B.splice(i, 1); removed = true; break; }
          sfx('hit');
          if (b.pierce > 0) b.pierce--;
          else { B.splice(i, 1); removed = true; }
          break;
        }
      }
    } else {
      const p = G.player;
      if (p && !p.dead && p.iT <= 0 && dist(b.x, b.y, p.x, p.y) < b.r + p.r - 1) {
        if (b.explode) explode(b.x, b.y, b.explode, b.dmg, false);
        else p.hurt(b.dmg);
        B.splice(i, 1); removed = true; break;
      }
      const q = G.companion;
      if (q && !q.downed && !removed && q.iT <= 0 && dist(b.x, b.y, q.x, q.y) < b.r + q.r - 1) {
        q.hurt(b.dmg);
        B.splice(i, 1); removed = true; break;
      }
    }
  }
}

export function updateParticles(dt) {
  const P = G.particles;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.t += dt;
    if (p.t > p.life) { P.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.grav) p.vy += p.grav * dt;
    p.vx *= 0.98; p.vy *= 0.98;
  }
}

export function updateZones(dt) {
  const Z = G.zones;
  for (let i = Z.length - 1; i >= 0; i--) {
    const z = Z[i];
    z.t -= dt; z.tick -= dt;
    if (z.t <= 0) { Z.splice(i, 1); continue; }
    if (Math.random() < dt * 12) spawnParts(z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r, { n: 1, colors: ['#f2824a', '#f2b05e', '#d84b3a'], spd: 25, life: 0.4, size: 2, dir: -Math.PI / 2, spread: 0.8 });
    if (z.tick <= 0) {
      z.tick = 0.5;
      if (z.hostile) {
        if (G.player && !G.player.dead && dist(z.x, z.y, G.player.x, G.player.y) < z.r + G.player.r) G.player.hurt(z.dps);
        if (G.companion && !G.companion.downed && dist(z.x, z.y, G.companion.x, G.companion.y) < z.r + G.companion.r) G.companion.hurt(z.dps);
      } else {
        for (const e of G.room.enemies) {
          if (!e.dead && dist(z.x, z.y, e.x, e.y) < z.r + e.r) e.hurt(z.dps, {});
        }
      }
    }
  }
}

export function updateTelegraphs(dt) {
  const Tg = G.telegraphs;
  for (let i = Tg.length - 1; i >= 0; i--) {
    const g = Tg[i];
    g.t += dt;
    if (g.t >= g.dur) { Tg.splice(i, 1); g.onDone && g.onDone(); }
  }
}

export function drawBullets(ctx) {
  for (const b of G.bullets) {
    if (b.kind === 'molotov') {
      const gy = b.y - b.z;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 3, 2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6ac07a'; ctx.fillRect(b.x - 2, gy - 3, 4, 6);
      continue;
    }
    if (b.kind === 'laser' || b.kind === 'plasma') {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
      ctx.fillStyle = b.color; ctx.fillRect(-b.size * 2, -1, b.size * 4, 2);
      ctx.globalAlpha = 0.4; ctx.fillRect(-b.size * 3, -b.size / 2, b.size * 6, b.size);
      ctx.restore();
      continue;
    }
    if (b.kind === 'flame') {
      ctx.globalAlpha = clamp(1 - b.t / b.ttl, 0, 1) * 0.9;
      ctx.fillStyle = b.t * 10 % 2 < 1 ? '#f2b05e' : '#f2824a';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.size + b.t * 8, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    if (b.kind === 'grenade' || b.kind === 'signal') {
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(b.x, b.y, b.size + 2 + Math.sin(b.t * 20) * 1.5, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    if (b.kind === 'plasma') {
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(b.x, b.y, b.size + 3, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      continue;
    }
    if (b.kind === 'homing') {
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(b.x - b.vx * 0.02, b.y - b.vy * 0.02, b.size * 0.7, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    // bullet / arrow
    const a = Math.atan2(b.vy, b.vx);
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
    ctx.fillStyle = b.color;
    if (b.kind === 'arrow') { ctx.fillRect(-5, -1, 10, 2); ctx.fillRect(3, -3, 3, 6); }
    else ctx.fillRect(-b.size, -1.5, b.size * 2, 3);
    ctx.restore();
  }
}

export function drawParticles(ctx) {
  for (const p of G.particles) {
    ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

export function drawZones(ctx) {
  for (const z of G.zones) {
    ctx.globalAlpha = 0.16 + Math.sin(G.time * 9) * 0.05;
    ctx.fillStyle = z.color;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = z.color; ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function drawTelegraphs(ctx) {
  for (const g of G.telegraphs) {
    const p = g.t / g.dur;
    ctx.strokeStyle = '#e05540';
    ctx.globalAlpha = 0.5 + p * 0.5;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#e05540';
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r * p, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function clearRoomFx() {
  G.bullets.length = 0;
  G.particles.length = 0;
  G.zones.length = 0;
  G.telegraphs.length = 0;
}
