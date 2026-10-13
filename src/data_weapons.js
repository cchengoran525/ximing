// 武器数据表（结构扁平，便于日后映射 Godot Resource）
// cost=每次射击耗能  rate=射击间隔(秒)  dmg=单发伤害  speed=弹速(px/s)
// spread=散布(弧度)  count=一次弹丸数  kind=弹道类型
export const RARITY = [
  { name: '普通', color: '#c9c9c9' },
  { name: '优良', color: '#6aa9e8' },
  { name: '稀有', color: '#b070e0' },
  { name: '传说', color: '#e8b84a' },
];

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: '制式手枪', rarity: 0, cost: 2, rate: 0.30,
    dmg: 4, speed: 280, spread: 0.05, count: 1, kind: 'bullet',
    color: '#f2d98a', size: 3, sfx: 'shoot', gunLen: 8, price: 0,
    desc: '执政厅配发的制式武器。可靠，无聊。',
  },
  smg: {
    id: 'smg', name: '巷战冲锋枪', rarity: 0, cost: 1, rate: 0.10,
    dmg: 2, speed: 260, spread: 0.16, count: 1, kind: 'bullet',
    color: '#e8e2d0', size: 2, sfx: 'shoot', gunLen: 10, price: 90,
    desc: '巷战年代的遗物，弹幕是它的语言。',
  },
  shotgun: {
    id: 'shotgun', name: '泵动霰弹枪', rarity: 1, cost: 5, rate: 0.78,
    dmg: 3, speed: 240, spread: 0.38, count: 5, kind: 'bullet',
    color: '#f2b05e', size: 3, sfx: 'shotgun', gunLen: 11, knock: 60, price: 170,
    desc: '近距离一切问题的终结者。',
  },
  rifle: {
    id: 'rifle', name: '老兵步枪', rarity: 1, cost: 3, rate: 0.55,
    dmg: 4, speed: 340, spread: 0.04, count: 1, kind: 'bullet', burst: 3, burstGap: 0.07,
    color: '#d8e8f2', size: 3, sfx: 'shoot', gunLen: 13, price: 170,
    desc: '三连发。据说它的主人从未回来取走它。',
  },
  magnum: {
    id: 'magnum', name: '旧日转轮', rarity: 1, cost: 4, rate: 0.5,
    dmg: 9, speed: 320, spread: 0.03, count: 1, kind: 'bullet', pierce: 1,
    color: '#f2a05e', size: 3, sfx: 'shoot_big', gunLen: 8, price: 200,
    desc: '一枪一个，像旧日的规矩。',
  },
  laser: {
    id: 'laser', name: '激光手枪', rarity: 1, cost: 3, rate: 0.22,
    dmg: 4, speed: 480, spread: 0.02, count: 1, kind: 'laser', pierce: 2,
    color: '#6fe8e0', size: 3, sfx: 'laser', gunLen: 9, price: 230,
    desc: '议会的科技下放品，微微发烫。',
  },
  flamer: {
    id: 'flamer', name: '火焰喷射器', rarity: 2, cost: 8, rate: 0.05,
    dmg: 2, speed: 150, spread: 0.35, count: 1, kind: 'flame',
    color: '#f2824a', size: 4, sfx: 'flame', gunLen: 12, burn: 3, price: 340,
    desc: '把街垒还给他们。烧干净。',
  },
  grenade: {
    id: 'grenade', name: '榴弹发射器', rarity: 2, cost: 9, rate: 0.95,
    dmg: 12, speed: 200, spread: 0.03, count: 1, kind: 'grenade',
    color: '#9ab04a', size: 4, sfx: 'shoot_big', gunLen: 12, explode: 40, price: 340,
    desc: '爆破组最后一件库存。',
  },
  crossbow: {
    id: 'crossbow', name: '猎手战弩', rarity: 2, cost: 4, rate: 0.62,
    dmg: 11, speed: 430, spread: 0.01, count: 1, kind: 'arrow', pierce: 1,
    color: '#d8d4ca', size: 3, sfx: 'shoot', gunLen: 11, price: 290,
    desc: '无声，精准，旧时代的猎风。',
  },
  signal: {
    id: 'signal', name: '信号枪', rarity: 2, cost: 6, rate: 0.85,
    dmg: 6, speed: 170, spread: 0.05, count: 1, kind: 'signal',
    color: '#f25e5e', size: 5, sfx: 'shoot_big', gunLen: 7, explode: 30, price: 310,
    desc: '发射的一刻，所有人都抬头。',
  },
  plasma: {
    id: 'plasma', name: '议会电浆炮', rarity: 3, cost: 7, rate: 0.38,
    dmg: 9, speed: 190, spread: 0.02, count: 1, kind: 'plasma', pierce: 3,
    color: '#8a7ae8', size: 6, sfx: 'laser', gunLen: 13, explode: 26, price: 520,
    desc: '议会从不解释它如何运作。',
  },
  minigun: {
    id: 'minigun', name: '旧日转管机枪', rarity: 3, cost: 1, rate: 0.045,
    dmg: 3, speed: 300, spread: 0.22, count: 1, kind: 'bullet',
    color: '#c9c9c9', size: 3, sfx: 'shoot', gunLen: 15, price: 560,
    desc: '革命者留下的最后一句话，以每秒二十二响说出。',
  },
  scepter: {
    id: 'scepter', name: '执政官权杖', rarity: 3, cost: 8, rate: 0.6,
    dmg: 14, speed: 170, spread: 0.02, count: 1, kind: 'homing',
    color: '#e8c14a', size: 5, sfx: 'laser', gunLen: 10, homing: 4, price: 620,
    desc: '它自己会寻找目标。权力也是。',
  },

  // ---- 合成武器（不在掉落池里，只能通过合成台） ----
  dual_pistol: {
    id: 'dual_pistol', name: '双持手枪', rarity: 1, cost: 3, rate: 0.28,
    dmg: 4, speed: 280, spread: 0.10, count: 2, kind: 'bullet',
    color: '#f2d98a', size: 3, sfx: 'shoot', gunLen: 8, price: -1,
    desc: '左手一把，右手一把，账要成对算。',
  },
  twin_smg: {
    id: 'twin_smg', name: '双重冲锋枪', rarity: 2, cost: 2, rate: 0.075,
    dmg: 2, speed: 260, spread: 0.20, count: 2, kind: 'bullet',
    color: '#e8e2d0', size: 2, sfx: 'shoot', gunLen: 10, price: -1,
    desc: '弹幕翻倍，噪音也翻倍。',
  },
  double_barrel: {
    id: 'double_barrel', name: '双管霰弹', rarity: 2, cost: 7, rate: 0.70,
    dmg: 3, speed: 240, spread: 0.45, count: 9, kind: 'bullet', knock: 70,
    color: '#f2b05e', size: 3, sfx: 'shotgun', gunLen: 12, price: -1,
    desc: '两根枪管，一次谈话机会。',
  },
  plasma_rifle: {
    id: 'plasma_rifle', name: '电浆步枪', rarity: 3, cost: 5, rate: 0.5,
    dmg: 6, speed: 380, spread: 0.03, count: 1, kind: 'laser', pierce: 1,
    burst: 3, burstGap: 0.06,
    color: '#8a7ae8', size: 3, sfx: 'laser', gunLen: 15, price: -1,
    desc: '议会的电源，老兵的枪机。',
  },
  firebomb: {
    id: 'firebomb', name: '燃烧榴弹', rarity: 3, cost: 9, rate: 0.9,
    dmg: 12, speed: 200, spread: 0.03, count: 1, kind: 'grenade',
    explode: 42, burn: 4, color: '#f2824a', size: 4, sfx: 'shoot_big', gunLen: 12, price: -1,
    desc: '爆炸之后，火还在替它说话。',
  },
  python: {
    id: 'python', name: '巨蟒转轮', rarity: 2, cost: 4, rate: 0.55,
    dmg: 14, speed: 340, spread: 0.02, count: 1, kind: 'bullet', pierce: 2,
    color: '#f2a05e', size: 3, sfx: 'shoot_big', gunLen: 9, price: -1,
    desc: '两把旧日转轮拆开又拼成的一把。',
  },
  flare_bolt: {
    id: 'flare_bolt', name: '信号弩', rarity: 2, cost: 5, rate: 0.68,
    dmg: 9, speed: 420, spread: 0.01, count: 1, kind: 'arrow', pierce: 1, explode: 24,
    color: '#f25e5e', size: 4, sfx: 'shoot', gunLen: 11, price: -1,
    desc: '无声地过去，响亮地结束。',
  },
  sovereign: {
    id: 'sovereign', name: '执政官权杖·改', rarity: 3, cost: 9, rate: 0.5,
    dmg: 14, speed: 180, spread: 0.02, count: 1, kind: 'homing', homing: 5, explode: 30,
    color: '#e8c14a', size: 5, sfx: 'laser', gunLen: 10, price: -1,
    desc: '权杖与电浆炮的合体。它更急了。',
  },
};

// 合成配方：两把武器 → 一把（顺序无关）
export const COMBOS = [
  { a: 'pistol', b: 'pistol', out: 'dual_pistol' },
  { a: 'smg', b: 'smg', out: 'twin_smg' },
  { a: 'shotgun', b: 'shotgun', out: 'double_barrel' },
  { a: 'rifle', b: 'laser', out: 'plasma_rifle' },
  { a: 'flamer', b: 'grenade', out: 'firebomb' },
  { a: 'magnum', b: 'magnum', out: 'python' },
  { a: 'crossbow', b: 'signal', out: 'flare_bolt' },
  { a: 'scepter', b: 'plasma', out: 'sovereign' },
];

export function comboKey(a, b) { return [a, b].sort().join('+'); }

const COMBO_MAP = new Map(COMBOS.map(c => [comboKey(c.a, c.b), c.out]));
export function comboResult(a, b) {
  if (!a || !b) return null;
  return COMBO_MAP.get(comboKey(a, b)) || null;
}

export const WEAPON_IDS = Object.keys(WEAPONS);
export function getWeapon(id) { return WEAPONS[id]; }
