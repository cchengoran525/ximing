// 精英词缀：精英敌人随机携带，改变战斗方式
export const AFFIXES = {
  rage: { id: 'rage', name: '狂暴', desc: '移动与攻击速度大幅提升', color: '#e05540' },
  shield: { id: 'shield', name: '护甲', desc: '附带一层护盾，需先击破', color: '#6fe8e0' },
  split: { id: 'split', name: '分裂', desc: '死亡时分裂出两只小怪', color: '#b070e0' },
  burn: { id: 'burn', name: '灼燃', desc: '周身燃烧光环，靠近会被点燃', color: '#f2824a' },
  stealth: { id: 'stealth', name: '潜行', desc: '远处近乎隐形，靠近才显形', color: '#6a6a78' },
};

export const AFFIX_IDS = Object.keys(AFFIXES);
