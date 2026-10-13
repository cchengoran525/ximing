// 主动技能：F 键释放，局内拾取（敌人掉落 / 宝箱 / 售货机）
export const SKILLS = {
  bomb: {
    id: 'bomb', name: '雷管', cd: 7, color: '#f2824a', price: 58,
    desc: '朝准星方向掷出强力炸药，命中即爆。',
  },
  decoy: {
    id: 'decoy', name: '诱饵', cd: 14, color: '#6fe8e0', price: 58,
    desc: '放置一个假目标，吸引敌人 6 秒。',
  },
  bandage: {
    id: 'bandage', name: '绷带包', cd: 22, color: '#6ac07a', price: 58,
    desc: '立刻回复 2 点生命。',
  },
};

export const SKILL_IDS = Object.keys(SKILLS);
