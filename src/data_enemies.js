// 敌人与 Boss 数据表。ai 决定行为函数（enemy.js）。
// hp/speed/r=碰撞半径 touch=接触伤害 shot=射击参数 parts=掉落零件区间
export const ENEMIES = {
  guard: {
    id: 'guard', name: '警卫', sprite: 'guard', hp: 12, speed: 34, r: 6, touch: 3,
    ai: 'gunner', cd: [1.3, 2.0], shot: { dmg: 3, speed: 150, count: 1, spread: 0.09 },
    parts: [1, 2], keepRange: [80, 150],
  },
  gang: {
    id: 'gang', name: '流弹兵', sprite: 'gang', hp: 10, speed: 50, r: 6, touch: 3,
    ai: 'gunner', cd: [0.9, 1.5], shot: { dmg: 2, speed: 185, count: 1, spread: 0.2 },
    parts: [1, 3], keepRange: [70, 130],
  },
  swat: {
    id: 'swat', name: '特警', sprite: 'swat', hp: 20, speed: 58, r: 6, touch: 4,
    ai: 'rusher', cd: [1.7, 2.4], shot: { dmg: 2, speed: 175, count: 4, spread: 0.45 },
    parts: [2, 3], range: 95,
  },
  drone: {
    id: 'drone', name: '巡逻无人机', sprite: 'drone', hp: 8, speed: 55, r: 6, touch: 2,
    ai: 'flyer', cd: [1.5, 2.1], shot: { dmg: 2, speed: 140, count: 2, spread: 0.25 },
    parts: [1, 2], fly: true, orbit: 85,
  },
  turret: {
    id: 'turret', name: '哨戒炮塔', sprite: 'turret', hp: 24, speed: 0, r: 7, touch: 0,
    ai: 'turret', cd: [2.0, 2.6], shot: { dmg: 3, speed: 210, count: 3, spread: 0.06, burst: true },
    parts: [2, 4], static: true,
  },
  dog: {
    id: 'dog', name: '警犬', sprite: 'dog', hp: 9, speed: 92, r: 5, touch: 4,
    ai: 'dog', cd: [1.4, 2.0], parts: [1, 2],
  },
  riot: {
    id: 'riot', name: '镇暴警', sprite: 'riot', hp: 30, speed: 22, r: 7, touch: 4,
    ai: 'shield', cd: [2.2, 3.0], parts: [3, 4], front: 0.25,
  },
  biker: {
    id: 'biker', name: '摩托兵', sprite: 'biker', hp: 16, speed: 72, r: 6, touch: 3,
    ai: 'charger', dashSpeed: 265, cd: [2.0, 3.2], parts: [2, 3],
  },
  sniper: {
    id: 'sniper', name: '狙击手', sprite: 'sniper', hp: 11, speed: 26, r: 6, touch: 2,
    ai: 'sniper', cd: [2.6, 3.4], shot: { dmg: 6, speed: 340 },
    parts: [2, 4], keepRange: [150, 230], aimTime: 1.0,
  },
  scav: {
    id: 'scav', name: '拾荒者', sprite: 'scav', hp: 14, speed: 40, r: 6, touch: 3,
    ai: 'thrower', cd: [2.2, 3.2], shot: { dmg: 3, speed: 130 },
    parts: [2, 3], keepRange: [110, 170],
  },
};

export const BOSSES = {
  commander: {
    id: 'commander', name: '卫戍司令官', title: '议事厅的看门人', sprite: 'commander', hp: 300, speed: 30, r: 12,
    ai: 'boss_indoor', touch: 5, parts: [40, 55], shot: { dmg: 3 },
    intro: '「议事厅重地。闲杂人等——就地正法。」',
  },
  riotcrawler: {
    id: 'riotcrawler', name: '「铁幕」', title: '镇暴装甲·陆走型', sprite: 'riotcrawler', hp: 330, speed: 26, r: 14,
    ai: 'boss_street', touch: 6, parts: [45, 60], shot: { dmg: 4 }, front: 0.2,
    intro: '「街区封锁令，第 114 号。执行。」',
  },
  sandstorm: {
    id: 'sandstorm', name: '「沙暴」', title: '公路掠夺者车王', sprite: 'sandstorm', hp: 360, speed: 60, r: 14,
    ai: 'boss_highway', touch: 6, parts: [50, 65], shot: { dmg: 4 },
    intro: '「上车的规矩：留下零件，或者留下命。」',
  },
  speaker: {
    id: 'speaker', name: '议长', title: '执槌者', sprite: 'speaker', hp: 520, speed: 26, r: 14,
    ai: 'boss_council', touch: 6, parts: [75, 95], shot: { dmg: 5 }, front: 0.3,
    intro: '「秩序不是暴力的反面。秩序，只是暴力的名字。」',
  },
  // 齐青支线关：旧队长（复用卫戍司令官的行为模式）
  oldcaptain: {
    id: 'oldcaptain', name: '旧队长', title: '卫戍营房看守', sprite: 'commander', hp: 260, speed: 34, r: 11,
    ai: 'boss_indoor', touch: 5, parts: [30, 45], shot: { dmg: 4 },
    intro: '「编号 0074。你还有脸回营房。」',
  },
};
