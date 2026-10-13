// 养成逻辑：零件 / 武器解锁 / 天赋 / 档案 / 统计 / 小屋等级
import { G, toast } from './state.js';
import { saveMeta } from './save.js';
import { WEAPONS } from './data_weapons.js';
import { TALENTS } from './data_buffs.js';
import { ACHIEVEMENTS } from './data_achievements.js';

export function save() { saveMeta(G.meta); }

export function houseLevel() {
  const t = G.meta.totalEarned;
  return t >= 600 ? 2 : t >= 200 ? 1 : 0;
}

export function addParts(n, runMul = 1) {
  const gain = Math.round(n * runMul);
  G.meta.parts += gain;
  G.meta.totalEarned += gain;
  G.meta.house = houseLevel();
  save();
  return gain;
}

export function trySpend(n) {
  if (G.meta.parts < n) return false;
  G.meta.parts -= n;
  save();
  return true;
}

export function unlockWeapon(id) {
  const w = WEAPONS[id];
  if (!w || w.price <= 0 || G.meta.weapons.includes(id)) return false;
  if (!trySpend(w.price)) return false;
  G.meta.weapons.push(id);
  save();
  return true;
}

export function unlockTalent(id) {
  const t = TALENTS[id];
  if (!t || G.meta.talents.includes(id)) return false;
  if (t.needQi && !G.meta.flags.qiMet) return false;
  if (!trySpend(t.price)) return false;
  G.meta.talents.push(id);
  save();
  return true;
}

export function toggleEquip(id) {
  const eq = G.meta.equipped;
  const i = eq.indexOf(id);
  if (i >= 0) eq.splice(i, 1);
  else {
    if (eq.length >= 2) return false;
    if (!G.meta.talents.includes(id)) return false;
    eq.push(id);
  }
  save();
  return true;
}

export function markStat(key, n = 1) {
  G.meta.stats[key] = (G.meta.stats[key] || 0) + n;
  save();
}

export function collectNote(text) {
  if (G.meta.notes.includes(text)) return false;
  G.meta.notes.push(text);
  save();
  return true;
}

// ---- 图鉴记录 ----
export function trackKill(id) {
  const c = G.meta.codex;
  c.kills[id] = (c.kills[id] || 0) + 1;
}

export function trackWeapon(id) {
  const c = G.meta.codex;
  if (!c.weapons.includes(id)) { c.weapons.push(id); save(); }
}

export function weaponSeen(id) { return G.meta.codex.weapons.includes(id); }

// ---- 成就结算：满足条件即达成并发放零件 ----
let achCheckedAt = 0;
export function checkAchievements(force = false) {
  if (!G.meta || !G.meta.stats) return;
  // 简单节流：避免每帧调用
  const now = Date.now();
  if (!force && now - achCheckedAt < 800) return;
  achCheckedAt = now;
  let gained = 0;
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (G.meta.ach.includes(a.id)) continue;
    let ok = false;
    try { ok = !!a.check(G.meta); } catch (e) { ok = false; }
    if (ok) {
      G.meta.ach.push(a.id);
      gained += a.reward;
      newly.push(a);
    }
  }
  if (newly.length) {
    if (gained) { G.meta.parts += gained; G.meta.totalEarned += gained; G.meta.house = houseLevel(); }
    save();
    for (const a of newly) {
      toast(`成就达成：${a.name}（+${a.reward} 零件）`, '#e8c14a');
    }
  }
}
