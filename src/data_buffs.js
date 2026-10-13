// 局内 Buff 与局外天赋。stat 字段由 player.applyBuff 累乘/累加。
export const BUFFS = {
  maxhp: { id: 'maxhp', name: '铁胃', desc: '生命上限 +2', stat: { maxHp: 2 } },
  energy: { id: 'energy', name: '浓缩电池', desc: '能量上限 +25', stat: { maxEn: 25 } },
  dmg: { id: 'dmg', name: '磨利枪口', desc: '伤害 +15%', stat: { dmgMul: 0.15 } },
  rate: { id: 'rate', name: '润滑枪机', desc: '射速 +15%', stat: { rateMul: 0.15 } },
  dashcd: { id: 'dashcd', name: '轻盈步伐', desc: '翻滚冷却 -25%', stat: { dashCdMul: -0.25 } },
  speed: { id: 'speed', name: '旧城巷鼠', desc: '移动速度 +10%', stat: { spdMul: 0.1 } },
  parts: { id: 'parts', name: '拾荒天赋', desc: '零件获取 +30%', stat: { partsMul: 0.3 } },
  regen: { id: 'regen', name: '急救绷带', desc: '每 8 秒回复 1 生命', special: 'regen' },
  shield: { id: 'shield', name: '备用装甲', desc: '每层开始获得 2 点护盾', special: 'floorShield' },
};

export const BUFF_IDS = Object.keys(BUFFS);

// 局外天赋：解锁后可在床上装备，每局最多 2 个
export const TALENTS = {
  t_hp: { id: 't_hp', name: '老练幸存者', desc: '生命上限 +2', price: 120, buff: 'maxhp' },
  t_en: { id: 't_en', name: '电池腰带', desc: '能量上限 +25', price: 120, buff: 'energy' },
  t_dash: { id: 't_dash', name: '夜行者', desc: '翻滚冷却 -25%', price: 150, buff: 'dashcd' },
  t_shield: { id: 't_shield', name: '战前存货', desc: '每层开始获得 2 点护盾', price: 180, buff: 'shield' },
  t_parts: { id: 't_parts', name: '拾荒人脉', desc: '零件获取 +30%', price: 200, buff: 'parts' },
  t_start: { id: 't_start', name: '缴获惯例', desc: '开局随机携带一把额外武器', price: 240, special: 'startWeapon' },
  t_regen: { id: 't_regen', name: '战地急救', desc: '每 8 秒回复 1 生命', price: 280, buff: 'regen' },
  t_dmg: { id: 't_dmg', name: '孤注一掷', desc: '伤害 +15%', price: 300, buff: 'dmg' },
  t_wolf: { id: 't_wolf', name: '狼群默契', desc: '齐青攻速 +30%，且每层开始为你回复 1 生命', price: 220, special: 'wolfBond', needQi: true },
};
