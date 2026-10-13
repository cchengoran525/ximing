// HUD：血量/能量/零件/武器槽/小地图/Boss条
import { G } from './state.js';
import { drawSpr } from './sprites.js';
import { RARITY } from './data_weapons.js';
import { BIOMES } from './data_biomes.js';
import { text, clamp, fmt } from './utils.js';

export function drawWeaponIcon(ctx, def, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#3a3f46';
  const len = def.gunLen || 10;
  ctx.fillRect(-len / 2, -2, len, 4);
  ctx.fillRect(-len / 2 + 1, 1, 3, 4); // 握把
  ctx.fillStyle = RARITY[def.rarity].color;
  ctx.fillRect(len / 2 - 3, -1.5, 3, 3);
  if (def.kind === 'laser' || def.kind === 'plasma') { ctx.fillStyle = def.color; ctx.fillRect(len / 2 - 5, -1, 2, 2); }
  if (def.kind === 'grenade' || def.kind === 'signal') { ctx.fillStyle = def.color; ctx.fillRect(-2, -4, 4, 2); }
  ctx.restore();
}

function drawHearts(ctx) {
  const p = G.player;
  const hearts = Math.ceil(p.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const hx = 10 + i * 15, hy = 10;
    const v = clamp(p.hp - i * 2, 0, 2); // 0 空 1 半 2 满
    ctx.globalAlpha = 0.9;
    if (v === 0) {
      ctx.globalAlpha = 0.25;
      drawSpr(ctx, 'heart', hx, hy, { scale: 1.5 });
    } else if (v === 1) {
      // 半颗：左半
      const c = drawSpr;
      ctx.save();
      ctx.beginPath(); ctx.rect(hx - 6, hy - 4, 5.5, 9); ctx.clip();
      drawSpr(ctx, 'heart', hx, hy, { scale: 1.5 });
      ctx.restore();
      ctx.globalAlpha = 0.25;
      drawSpr(ctx, 'heart', hx, hy, { scale: 1.5 });
    } else {
      drawSpr(ctx, 'heart', hx, hy, { scale: 1.5 });
    }
    ctx.globalAlpha = 1;
  }
  // 护盾
  if (p.shield > 0) {
    for (let i = 0; i < p.shield; i++) {
      ctx.fillStyle = '#6fe8e0';
      ctx.fillRect(10 + hearts * 15 + 6 + i * 9, 12, 6, 6);
      ctx.fillStyle = '#2a6a70';
      ctx.fillRect(10 + hearts * 15 + 6 + i * 9, 15, 6, 3);
    }
  }
}

function drawEnergy(ctx) {
  const p = G.player;
  const x = 10, y = 26, w = 90, h = 5;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a3a48';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e8d84a';
  ctx.fillRect(x, y, w * clamp(p.en / p.maxEn, 0, 1), h);
}

function drawParts(ctx) {
  drawSpr(ctx, 'gear', 130, 14, { scale: 1.6 });
  text(ctx, fmt(G.run ? G.run.parts : G.meta.parts), 140, 8, { size: 11, color: '#e8c14a', bold: true });
}

function drawSlots(ctx) {
  const p = G.player;
  for (let i = 0; i < 2; i++) {
    const slot = p.slots[i];
    const x = 10 + i * 74, y = 240;
    const active = p.cur === i;
    ctx.fillStyle = active ? 'rgba(232,193,85,0.16)' : 'rgba(10,10,15,0.6)';
    ctx.fillRect(x, y, 70, 36);
    ctx.strokeStyle = active ? '#e8c14a' : '#4a4a56';
    ctx.strokeRect(x + 0.5, y + 0.5, 69, 35);
    if (slot) {
      drawWeaponIcon(ctx, slot.def, x + 16, y + 14, 1.4);
      text(ctx, slot.def.name.slice(0, 6), x + 32, y + 5, { size: 8, color: active ? '#e8e2d0' : '#9a9aa8' });
      text(ctx, `⚡${slot.def.cost}`, x + 32, y + 18, { size: 8, color: '#b8b06a' });
      text(ctx, RARITY[slot.def.rarity].name, x + 32, y + 27, { size: 7, color: RARITY[slot.def.rarity].color });
    } else {
      text(ctx, '空', x + 30, y + 13, { size: 9, color: '#4a4a56' });
    }
    text(ctx, i === p.cur ? 'Q 切换' : '', x + 35, y - 11, { size: 7, color: '#6a6a78', align: 'center' });
  }
  // 翻滚冷却
  const p2 = G.player;
  if (p2.dashCd > 0) {
    const w = 60 * clamp(p2.dashCd / 1.1, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(10, 234, 60, 3);
    ctx.fillStyle = '#8a8a98';
    ctx.fillRect(10, 234, w, 3);
  }
}

function drawMinimap(ctx) {
  const run = G.run, map = G.room;
  if (!run || !run.floor || !run.floor.regions) return;
  const regions = run.floor.regions;
  const cellW = 11, cellH = 9;
  const ox = 512 - 110, oy = 10;
  ctx.fillStyle = 'rgba(10,10,15,0.5)';
  ctx.fillRect(ox - 6, oy - 6, 110, 74);
  for (const r of regions) {
    // 相邻已探索或自身已探索才显示
    let adjacent = false;
    for (const dir of Object.keys(r.doors)) {
      const nr = run.floor.regionByKey.get(r.doors[dir]);
      if (nr && nr.visited) adjacent = true;
    }
    if (!r.visited && !adjacent) continue;
    const x = ox + (r.gx - 1) * cellW, y = oy + (r.gy - 1) * cellH;
    let color = r.visited ? '#3f5a3f' : '#2c3440';
    if (r.visited) {
      if (r.type === 'boss') color = r.bossDead ? '#3f5a3f' : '#8c3038';
      else if (r.type === 'shop') color = '#8a7a2c';
      else if (r.type === 'treasure') color = '#a0842c';
      else if (r.type === 'elite') color = '#6a4a8c';
      else if (r.type === 'start') color = '#2c5a7a';
      else color = r.cleared ? '#3f5a3f' : '#5a4a3f';
    } else if (r.type === 'boss') color = '#5a2c2c';
    ctx.fillStyle = color;
    ctx.fillRect(x, y, cellW - 2, cellH - 2);
    if (G.region === r) {
      ctx.strokeStyle = Math.sin(G.time * 6) > 0 ? '#fff' : '#e8c14a';
      ctx.strokeRect(x - 0.5, y - 0.5, cellW - 1, cellH - 1);
    }
  }
  const mapLabel = run.mode === 'qi' ? '旧卫戍营房' : `第 ${run.floorIdx + 1}/4 层 · ${BIOMES[run.floor.biomeId].name}`;
  text(ctx, mapLabel, ox - 4, oy + 64, { size: 8, color: '#9a9aa8' });
  if (run.contract) {
    text(ctx, `契约 ${run.contract.name} · 零件×${run.contract.reward}`, ox - 4, oy + 75, { size: 8, color: '#e8b84a' });
  }
}

// 技能槽（武器槽右侧）
function drawSkill(ctx) {
  const p = G.player;
  const x = 158, y = 240;
  ctx.fillStyle = 'rgba(10,10,15,0.6)';
  ctx.fillRect(x, y, 70, 36);
  ctx.strokeStyle = p.skill ? (p.skill.def.color || '#4a4a56') : '#4a4a56';
  ctx.strokeRect(x + 0.5, y + 0.5, 69, 35);
  if (p.skill) {
    drawSpr(ctx, 'skill_' + p.skill.id, x + 15, y + 17, { scale: 1.5 });
    text(ctx, p.skill.def.name, x + 31, y + 5, { size: 8, color: '#e8e2d0' });
    const ready = (p.skillCd || 0) <= 0;
    text(ctx, 'F 释放', x + 31, y + 17, { size: 8, color: ready ? '#6ac07a' : '#8a8a98' });
    if (!ready) {
      text(ctx, p.skillCd.toFixed(1) + 's', x + 31, y + 27, { size: 7, color: '#e8c14a' });
      ctx.fillStyle = 'rgba(10,10,15,0.6)';
      ctx.fillRect(x + 1, y + 1, 68, 34 * clamp(p.skillCd / (p.skill.def.cd || 1), 0, 1));
    }
  } else {
    text(ctx, '技能槽', x + 24, y + 8, { size: 9, color: '#4a4a56' });
    text(ctx, '敌人掉落 / 售货机', x + 8, y + 22, { size: 7, color: '#3a3a48' });
  }
}

export function drawHUD(ctx) {
  if (!G.player) return;
  drawHearts(ctx);
  drawEnergy(ctx);
  drawParts(ctx);
  drawSlots(ctx);
  drawSkill(ctx);
  drawMinimap(ctx);

  // Boss 血条
  const boss = G.room && G.room.enemies.find(e => e.boss && !e.dead);
  if (boss) {
    const w = 260, x = (512 - w) / 2, y = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 2, y - 2, w + 4, 12);
    ctx.fillStyle = '#3a1418';
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = '#c04a3a';
    ctx.fillRect(x, y, w * clamp(boss.hp / boss.maxHp, 0, 1), 8);
    text(ctx, `${boss.def.name} · ${boss.def.title}`, 256, y + 10, { size: 9, color: '#f2c9b0', align: 'center' });
  }

  // 交互提示
  drawHint(ctx);
}

// 交互提示气泡（世界坐标 → 屏幕，需 G.cam）
export function drawHint(ctx) {
  if (!G.hint || !G.cam) return;
  const { x, y, str } = G.hint;
  const sx = x - G.cam.x, sy = y - G.cam.y;
  if (sx > -40 && sx < 552 && sy > -20 && sy < 308) {
    ctx.font = 'bold 9px sans-serif';
    const tw = Math.max(ctx.measureText(str).width, 12);
    ctx.fillStyle = 'rgba(10,10,15,0.8)';
    ctx.fillRect(sx - tw / 2 - 5, sy - 8, tw + 10, 13);
    ctx.strokeStyle = '#e8c14a';
    ctx.strokeRect(sx - tw / 2 - 5.5, sy - 8.5, tw + 11, 14);
    text(ctx, str, sx, sy - 6, { size: 9, color: '#e8e2d0', align: 'center', bold: true });
  }
}
