// 悬赏契约：每层出发前在通缉板上接一个，风险换报酬（本层零件收入倍率）
export const CONTRACTS = {
  hunt: { id: 'hunt', name: '追捕令', desc: '本层敌人数量 +25%', reward: 1.4 },
  lockdown: { id: 'lockdown', name: '封锁令', desc: '本层拾取无法回复生命', reward: 1.6 },
  haste: { id: 'haste', name: '急件', desc: '本层敌人出手更快（攻击间隔 -20%）', reward: 1.4 },
  blooddebt: { id: 'blooddebt', name: '血债', desc: '本层受到的伤害 +30%', reward: 1.5 },
  silent: { id: 'silent', name: '静默', desc: '本层能量回复 -40%，翻滚冷却 +40%', reward: 1.35 },
};

export const CONTRACT_IDS = Object.keys(CONTRACTS);
