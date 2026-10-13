// localStorage 存档
const KEY = 'ximing_save_v1';

export function defaultMeta() {
  return {
    v: 1,
    parts: 0,
    totalEarned: 0,
    weapons: ['pistol'],       // 已解锁进掉落池的武器
    talents: [],               // 已解锁天赋 id
    equipped: [],              // 已装备天赋（≤2）
    notes: [],                 // 已收集档案文本 index
    flags: {},                 // 剧情/系统旗标
    stats: { runs: 0, wins: 0, kills: 0, bosses: 0, elites: 0, combos: 0, contracts: 0, deaths: 0 },
    sound: { music: 1, sfx: 1 },
    companion: false,          // 是否携带齐青出战
    house: 0,                  // 小屋翻新等级
    codex: { kills: {}, weapons: [] }, // 图鉴：敌人击杀数、见过的武器
    ach: [],                   // 已达成成就 id
  };
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMeta();
    const m = JSON.parse(raw);
    return {
      ...defaultMeta(), ...m,
      stats: { ...defaultMeta().stats, ...(m.stats || {}) },
      sound: { ...defaultMeta().sound, ...(m.sound || {}) },
      flags: { ...(m.flags || {}) },
      codex: { kills: {}, weapons: [], ...(m.codex || {}) },
    };
  } catch (e) {
    console.warn('存档读取失败，使用新存档', e);
    return defaultMeta();
  }
}

export function saveMeta(meta) {
  try { localStorage.setItem(KEY, JSON.stringify(meta)); }
  catch (e) { console.warn('存档写入失败', e); }
}

export function resetMeta() {
  localStorage.removeItem(KEY);
  return defaultMeta();
}
