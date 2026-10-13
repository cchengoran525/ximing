// 楼层生成 v3：每个区域有自己的空间性格
//   室内：许多小房间、形状各异、走廊窄（门厅）
//   街道：几条长街 + 垂直小巷 + 街边店面
//   公路：少数大开阔区 + 宽阔公路连接 + 车流/火车横穿
// 通用：房间形状遮罩（矩形/L/凸/十字/八角/圆形/缺口），闸门按区域封锁
import { RNG } from './utils.js';
import { T, TS } from './world.js';
import { BIOMES } from './data_biomes.js';
import { WEAPONS } from './data_weapons.js';
import { SKILL_IDS } from './data_skills.js';
import { G } from './state.js';

const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };

const OBSTACLE_TILE = {
  crate: T.CRATE, desk: T.DESK, column: T.COLUMN, car: T.CAR, rail: T.RAIL, rubble: T.RUBBLE, hydrant: T.HYDRANT,
  meeting: T.MEETING, cabinet: T.CABINET, cooler: T.COOLER, vendm: T.VENDM, trash: T.TRASH, booth: T.BOOTH,
  mailbox: T.MAILBOX, tiers: T.TIERS, deadtree: T.DEADTREE, sandbag: T.SANDBAG, campfire: T.CAMPFIRE,
  roadsign: T.ROADSIGN, stall: T.STALL, plantt: T.PLANTT,
};
const DECAL_TILE = { puddle: T.PUDDLE, blood: T.BLOOD, shells: T.SHELLS, cone: T.CONE, grate: T.GRATE, scorch: T.SCORCH };

const WALL_VARIANTS = [
  ['window', T.WALL_WINDOW], ['poster', T.WALL_POSTER], ['graffiti', T.WALL_GRAFFITI], ['crack', T.WALL_CRACK],
  ['sign', T.WALL_SIGN], ['neon', T.WALL_NEON], ['whiteboard', T.WALL_WHITEBOARD], ['painting', T.WALL_PAINTING],
  ['banner', T.WALL_BANNER], ['elevator', T.WALL_ELEVATOR],
];
function pickWallVariant(rng, table) {
  let total = 0;
  for (const [k] of WALL_VARIANTS) total += (table[k] || 0);
  const r = rng.f();
  if (r > total) return T.WALL;
  let acc = 0;
  for (const [k, tile] of WALL_VARIANTS) {
    const w = table[k] || 0;
    if (!w) continue;
    acc += w;
    if (r <= acc) return tile;
  }
  return T.WALL;
}

// ---------------- 各区域的空间参数 ----------------
const GEN = {
  indoor: {
    pitchX: 28, pitchY: 26, corridor: 2, margin: 2,
    count: [10, 12],
    sizes: { start: [12, 10], combat: [13, 11], elite: [15, 12], treasure: [10, 9], shop: [12, 10], vault: [9, 8], boss: [21, 17] },
    shapes: {
      start: ['oct', 'rect', 'L'], combat: ['rect', 'L', 'T', 'plus', 'oct', 'bite'], elite: ['L', 'plus', 'oct', 'bite', 'T'],
      treasure: ['oct', 'rect'], shop: ['rect', 'bite', 'oct'], vault: ['oct', 'rect'], boss: ['oct', 'plus', 'rect'],
    },
    extraEdges: 3,   // 额外连边，形成环路
    wallFill: T.WALL,
  },
  street: {
    pitchX: 42, pitchY: 20, corridor: 2, margin: 2,
    count: [7, 8],
    sizes: {
      street: [34, 6], shop: [12, 9], treasure: [10, 9], elite: [16, 10], vault: [9, 8], boss: [24, 14], start: [20, 6],
      store: [9, 7],
    },
    shapes: {
      street: ['rect'], start: ['rect'], combat: ['rect'], shop: ['rect', 'bite'], treasure: ['rect', 'oct'],
      elite: ['rect', 'L', 'oct'], vault: ['rect'], boss: ['plus', 'oct', 'rect'], store: ['rect'],
    },
    wallFill: T.WALL,
  },
  highway: {
    pitchX: 52, pitchY: 38, corridor: 9, margin: 3,
    count: [5, 6],
    sizes: { start: [30, 20], combat: [38, 26], elite: [34, 24], treasure: [22, 17], shop: [26, 20], vault: [18, 15], boss: [48, 32] },
    shapes: {
      start: ['rect', 'oct'], combat: ['rect', 'oct', 'bite', 'roundish'], elite: ['oct', 'bite', 'rect'],
      treasure: ['oct', 'rect'], shop: ['rect', 'oct'], vault: ['oct', 'rect'], boss: ['roundish', 'oct', 'plus', 'rect'],
    },
    extraEdges: 1,
    wallFill: T.WALL,   // 崖壁
    traffic: true,
  },
  council: {
    pitchX: 32, pitchY: 28, corridor: 3, margin: 2,
    count: [8, 9],
    sizes: { start: [16, 12], combat: [18, 13], elite: [19, 14], treasure: [12, 10], shop: [14, 11], vault: [10, 9], boss: [24, 19] },
    shapes: {
      start: ['oct', 'rect'], combat: ['rect', 'plus', 'oct', 'T', 'bite'], elite: ['plus', 'oct', 'T'],
      treasure: ['oct', 'rect'], shop: ['rect', 'oct'], vault: ['oct'], boss: ['plus', 'oct', 'rect'],
    },
    extraEdges: 3,
    wallFill: T.WALL,
  },
};

// ---------------- 形状遮罩 ----------------
function shapeMask(kind, w, h, rng) {
  const m = new Uint8Array(w * h);
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1; };
  const fill = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y); };
  const clear = (x0, y0, x1, y1) => {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) m[y * w + x] = 0;
  };
  fill(0, 0, w - 1, h - 1);
  const cw = Math.max(2, Math.round(w * (0.28 + rng.f() * 0.12)));
  const ch = Math.max(2, Math.round(h * (0.28 + rng.f() * 0.12)));
  if (kind === 'L') {
    const corner = rng.int(0, 3);
    if (corner === 0) clear(0, 0, cw - 1, ch - 1);
    else if (corner === 1) clear(w - cw, 0, w - 1, ch - 1);
    else if (corner === 2) clear(0, h - ch, cw - 1, h - 1);
    else clear(w - cw, h - ch, w - 1, h - 1);
  } else if (kind === 'T') {
    if (rng.chance(0.5)) { clear(0, 0, cw - 1, ch - 1); clear(w - cw, 0, w - 1, ch - 1); }
    else { clear(0, h - ch, cw - 1, h - 1); clear(w - cw, h - ch, w - 1, h - 1); }
  } else if (kind === 'plus') {
    clear(0, 0, cw - 1, ch - 1); clear(w - cw, 0, w - 1, ch - 1);
    clear(0, h - ch, cw - 1, h - 1); clear(w - cw, h - ch, w - 1, h - 1);
  } else if (kind === 'oct') {
    const cut = Math.max(2, Math.round(Math.min(w, h) * (0.20 + rng.f() * 0.12)));
    for (let y = 0; y < cut; y++) {
      const c = cut - y;
      for (let x = 0; x < c; x++) {
        m[y * w + x] = 0; m[y * w + (w - 1 - x)] = 0;
        m[(h - 1 - y) * w + x] = 0; m[(h - 1 - y) * w + (w - 1 - x)] = 0;
      }
    }
  } else if (kind === 'roundish') {
    const rx = (w - 1) / 2, ry = (h - 1) / 2, cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1.0) m[y * w + x] = 0;
    }
  } else if (kind === 'bite') {
    // 贴着某条边挖 1-2 个缺口，保留通路宽度
    const bites = rng.int(1, 2);
    for (let i = 0; i < bites; i++) {
      const bw = Math.min(Math.max(3, w - 8), rng.int(3, Math.max(4, Math.round(w * 0.30))));
      const bh = Math.min(Math.max(3, h - 8), rng.int(3, Math.max(4, Math.round(h * 0.30))));
      if (bw < 2 || bh < 2) continue;
      const side = rng.int(0, 3);
      if (side === 0) { const x0 = rng.int(2, Math.max(2, w - bw - 2)); clear(x0, 0, x0 + bw - 1, bh - 1); }
      else if (side === 1) { const x0 = rng.int(2, Math.max(2, w - bw - 2)); clear(x0, h - bh, x0 + bw - 1, h - 1); }
      else if (side === 2) { const y0 = rng.int(2, Math.max(2, h - bh - 2)); clear(0, y0, bw - 1, y0 + bh - 1); }
      else { const y0 = rng.int(2, Math.max(2, h - bh - 2)); clear(w - bw, y0, w - 1, y0 + bh - 1); }
    }
  }
  // 兜底：可走面积过小则退回矩形
  let walk = 0;
  for (let i = 0; i < m.length; i++) walk += m[i];
  if (walk < w * h * 0.45) m.fill(1);
  return m;
}

// 沿某条边找一个"可靠的开口位置"（该处 3 格宽都实心、且尽量靠中）
function findOpening(mask, w, h, dir) {
  const mid = dir === 'e' || dir === 'w' ? Math.floor(h / 2) : Math.floor(w / 2);
  const span = dir === 'e' || dir === 'w' ? h : w;
  const solid = (a, b) => {
    // a: 沿边的坐标, b: 向内深度 0..2
    if (dir === 'e') return mask[a * w + (w - 1 - b)] === 1;
    if (dir === 'w') return mask[a * w + b] === 1;
    if (dir === 's') return mask[(h - 1 - b) * w + a] === 1;
    return mask[b * w + a] === 1;
  };
  const cands = [];
  for (let a = 2; a < span - 2; a++) cands.push(a);
  cands.sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid));
  for (const a of cands) {
    if (solid(a, 0) && solid(a, 1) && solid(a, 2)) return a;
  }
  return mid;
}

// ---------------- 布局：随机生长（室内 / 议事厅 / 公路） ----------------
function layoutGrow(rng, cfg, floorIdx) {
  const target = rng.int(cfg.count[0], Math.min(cfg.count[1] + 1, cfg.count[0] + 2 + floorIdx));
  const cells = new Map();
  const keys = [];
  const START = '2,1';
  cells.set(START, { gx: 2, gy: 1 });
  keys.push(START);
  let guard = 0;
  while (keys.length < target && guard++ < 900) {
    const base = cells.get(keys[Math.floor(rng.f() * keys.length)]);
    const dirs = rng.shuffle(['n', 's', 'w', 'e']);
    for (const d of dirs) {
      const nx = base.gx + DIRS[d][0], ny = base.gy + DIRS[d][1];
      const k = nx + ',' + ny;
      if (!cells.has(k) && nx >= 0 && nx <= 5 && ny >= 0 && ny <= 3) { cells.set(k, { gx: nx, gy: ny }); keys.push(k); break; }
    }
  }
  const edges = [];
  for (const k of keys) {
    const c = cells.get(k);
    for (const d of ['e', 's']) {
      const nk = (c.gx + DIRS[d][0]) + ',' + (c.gy + DIRS[d][1]);
      if (cells.has(nk)) edges.push([k, nk]);
    }
  }
  // 额外连边：形成环路、增加连通感
  const extra = cfg.extraEdges || 0;
  let added = 0, guard2 = 0;
  while (added < extra && guard2++ < 200) {
    const a = keys[Math.floor(rng.f() * keys.length)];
    const b = keys[Math.floor(rng.f() * keys.length)];
    if (a === b) continue;
    const ca = cells.get(a), cb = cells.get(b);
    const dist = Math.abs(ca.gx - cb.gx) + Math.abs(ca.gy - cb.gy);
    if (dist !== 2) continue;
    const exists = edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (exists) continue;
    edges.push([a, b]);
    added++;
  }
  // 布局几何：只按实际用到的坐标压缩
  const gxs = keys.map(k => cells.get(k).gx), gys = keys.map(k => cells.get(k).gy);
  const minGx = Math.min(...gxs), minGy = Math.min(...gys);
  for (const k of keys) {
    const c = cells.get(k);
    c.ix = c.gx - minGx; c.iy = c.gy - minGy;
  }
  return { cells, keys, edges, START };
}

// ---------------- 布局：街道（长街 + 小巷 + 店面） ----------------
function layoutStreets(rng, cfg) {
  const cells = new Map();
  const edges = [];
  const addCell = (key, gx, gy) => { cells.set(key, { gx, gy, ix: gx, iy: gy }); return key; };
  // 两条长街（横向链），每条 2-3 段
  const streetCells = [];
  for (let row = 0; row < 2; row++) {
    const segs = rng.int(2, 3);
    let prev = null;
    for (let i = 0; i < segs; i++) {
      const key = addCell(`s${row}_${i}`, i, row * 2);
      streetCells.push(key);
      if (prev) edges.push([prev, key]);
      prev = key;
    }
  }
  const startKey = streetCells[0];
  // 小巷：把第二条街的某一端与第一条街对应位置连起来（垂直）
  const alleyA = streetCells[Math.floor(rng.f() * Math.min(2, streetCells.length))];       // 街 A 的某段
  const alleyB = streetCells[streetCells.length - 1 - Math.floor(rng.f() * 2)];              // 街 B 的某段
  edges.push([alleyA, alleyB]);
  if (rng.chance(0.7)) {
    const a2 = streetCells[Math.min(1, streetCells.length - 1)];
    const b2 = streetCells[streetCells.length - 2];
    if (a2 !== b2) edges.push([a2, b2]);
  }
  // 街边店面：挂在街道下方（gy + 1），随机选 3-4 个位置
  const shopSpots = rng.shuffle(streetCells.slice()).slice(0, rng.int(3, 4));
  const shopKeys = [];
  shopSpots.forEach((sk, i) => {
    const c = cells.get(sk);
    const key = addCell(`r${i}`, c.gx, c.gy + 1);
    edges.push([sk, key]);
    shopKeys.push(key);
  });
  // 可进出的小店（独立于任务房，纯粹可搜刮的室内）
  const storeKeys = [];
  const storeSpots = rng.shuffle(streetCells.slice()).slice(0, rng.int(2, 3));
  storeSpots.forEach((sk, i) => {
    const c = cells.get(sk);
    const key = addCell(`t${i}`, c.gx, c.gy + 1);
    if (!edges.some(([a, b]) => (a === key && b === sk) || (a === sk && b === key))) edges.push([sk, key]);
    storeKeys.push(key);
  });
  return { cells, keys: [...cells.keys()], edges, START: startKey, shopKeys, streetKeys: streetCells, storeKeys };
}

// ---------------- 室内房间主题化陈设 ----------------
const INDOOR_THEMES = ['meeting', 'breakroom', 'server', 'archive', 'office', 'office'];
const THEME_LABEL = { meeting: '会议室', breakroom: '茶水间', server: '机房', archive: '档案室', office: '办公区', lobby: '门厅' };

function setIfFloor(set, get, x, y, tile) {
  const t = get(x, y);
  if (t >= T.FLOOR && t <= T.FLOOR3) { set(x, y, tile); return true; }
  return false;
}

function dressIndoor(reg, rng, set, get) {
  const cx = Math.floor(reg.cx), cy = Math.floor(reg.cy);
  const th = reg.theme || 'office';
  // 战斗房中央留出空场（打起来有地方走位），陈设都靠边
  const pad = (th === 'office' || th === 'meeting' || th === 'server' || th === 'archive') ? 3 : 2;
  const put = (x, y, tile) => {
    if (Math.abs(x - cx) <= pad && Math.abs(y - cy) <= pad) return;
    setIfFloor(set, get, x, y, tile);
  };
  if (th === 'meeting') {
    // 长桌靠上 + 少量椅子 + 一小段玻璃
    for (const i of [-5, -4, 4, 5]) put(cx + i, cy - 4, T.MEETING);
    put(cx - 5, cy - 2, T.DESK); put(cx + 5, cy - 2, T.DESK);
    for (const i of [-1, 0, 1]) put(cx - 7, cy + i, T.GLASS);
  } else if (th === 'breakroom') {
    put(cx - 5, cy - 4, T.COOLER);
    put(cx + 5, cy - 4, T.VENDM);
    put(cx - 4, cy + 4, T.PLANTT);
    put(cx + 4, cy + 4, T.MEETING);
  } else if (th === 'server') {
    for (const [dx, dy] of [[-5, -4], [-1, -4], [3, -4], [-5, 4], [-1, 4], [3, 4]]) {
      put(cx + dx, cy + dy, T.CABINET);
    }
    put(cx + 6, cy - 4, T.COOLER); put(cx + 6, cy + 4, T.COOLER);
    for (const i of [-1, 0, 1]) put(cx - 7, cy + i, T.GLASS);
  } else if (th === 'archive') {
    for (const dx of [-5, -1, 3]) {
      put(cx + dx, cy - 4, T.CABINET);
      put(cx + dx, cy + 4, T.CABINET);
    }
  } else {
    // 办公区：四角桌 + 两侧短玻璃隔断
    for (const [dx, dy] of [[-5, -4], [4, -4], [-5, 4], [4, 4]]) put(cx + dx, cy + dy, T.DESK);
    for (const i of [-1, 0, 1]) { put(cx - 7, cy + i, T.GLASS); put(cx + 6, cy + i, T.GLASS); }
  }
}

// 在区域掩码内找一个地面格（找不到返回 null）
function findFloorTile(reg, rng, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const x = reg.x0 + 1 + Math.floor(rng.f() * (reg.w - 2));
    const y = reg.y0 + 1 + Math.floor(rng.f() * (reg.h - 2));
    const lx = x - reg.x0, ly = y - reg.y0;
    if (lx < 0 || ly < 0 || lx >= reg.w || ly >= reg.h) continue;
    if (reg.mask[ly * reg.w + lx] !== 1) continue;
    return { x, y };
  }
  return null;
}

// ---------------- 主入口 ----------------
export function buildFloorMap(biomeId, floorIdx, seed) {
  const rng = new RNG(seed);
  const biome = BIOMES[biomeId];
  const cfg = GEN[biomeId] || GEN.indoor;

  const layout = biomeId === 'street' ? layoutStreets(rng, cfg) : layoutGrow(rng, cfg, floorIdx);
  const { cells, keys, edges } = layout;

  // 类型指派
  const depth = new Map([[layout.START, 0]]);
  const q = [layout.START];
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  while (q.length) {
    const k = q.shift();
    for (const nk of (adj.get(k) || [])) {
      if (!depth.has(nk)) { depth.set(nk, depth.get(k) + 1); q.push(nk); }
    }
  }
  for (const k of keys) if (!depth.has(k)) depth.set(k, 99);
  const types = new Map([[layout.START, 'start']]);
  const sorted = keys.slice().filter(k => k !== layout.START).sort((a, b) => depth.get(b) - depth.get(a));
  const bossKey = sorted[0];
  if (bossKey) types.set(bossKey, 'boss');
  const remaining = sorted.slice(1);
  const specials = biomeId === 'street' ? ['shop', 'treasure', 'elite', 'shop'] : ['treasure', 'shop', 'elite'];
  let ri = 0;
  for (const sp of specials) {
    while (ri < remaining.length && types.has(remaining[ri])) ri++;
    if (ri >= remaining.length) break;
    types.set(remaining[ri], sp);
    ri++;
  }
  // 长街段本身按"街道"处理（战斗区），店面按各自类型
  const isStreetSeg = k => biomeId === 'street' && /^s\d+_\d+$/.test(k);
  const isStore = k => biomeId === 'street' && /^t\d+$/.test(k);
  for (const k of keys) {
    if (types.has(k)) continue;
    types.set(k, isStore(k) ? 'store' : 'combat');
  }
  // 室内/议事厅随机多出一个"库房"（纯零件的安静小房间）
  if (biomeId === 'indoor' || biomeId === 'council') {
    const cand = keys.filter(k => types.get(k) === 'combat');
    if (cand.length > 2 && rng.chance(0.7)) types.set(cand[Math.floor(rng.f() * cand.length)], 'vault');
  }
  // 保底：战斗房数量不足时，把最浅的特殊房退回战斗房
  const minCombat = biomeId === 'highway' ? 3 : biomeId === 'street' ? 2 : 4;
  let combatCount = keys.filter(k => types.get(k) === 'combat').length;
  if (combatCount < minCombat) {
    const order = ['shop', 'treasure', 'vault', 'elite'];
    const candidates = keys
      .filter(k => order.includes(types.get(k)) && k !== layout.START && k !== bossKey)
      .sort((a, b) => (depth.get(a) || 99) - (depth.get(b) || 99));
    for (const k of candidates) {
      if (combatCount >= minCombat) break;
      if (types.get(k) === 'vault') continue;
      types.set(k, 'combat');
      combatCount++;
    }
  }

  // ---- 尺寸与像素包围盒 ----
  const regions = [];
  const regionByKey = new Map();
  const pitchX = cfg.pitchX, pitchY = cfg.pitchY;
  for (const key of keys) {
    const c = cells.get(key);
    const type = types.get(key);
    const streetSeg = isStreetSeg(key) && (type === 'combat' || type === 'start');
    let sizeKey = type;
    if (streetSeg) sizeKey = type === 'start' ? 'start' : 'street';
    const sz = cfg.sizes[sizeKey] || cfg.sizes.combat || [14, 11];
    const jitter = type === 'boss' ? 0 : rng.int(-1, 1);
    const w = Math.max(8, sz[0] + jitter);
    const h = Math.max(8, sz[1] + jitter);
    const x0 = c.ix * pitchX + Math.max(1, Math.floor((pitchX - w) / 2));
    const y0 = c.iy * pitchY + Math.max(1, Math.floor((pitchY - h) / 2));
    const shapes = (cfg.shapes[type] || ['rect']);
    const reg = {
      key, gx: c.ix, gy: c.iy, type,
      x0, y0, w, h,
      cx: x0 + w / 2, cy: y0 + h / 2,
      shape: w * h > 60 && type !== 'street' ? rng.pick(shapes) : (type === 'street' ? 'rect' : rng.pick(shapes)),
      cleared: type === 'start' || type === 'treasure' || type === 'shop' || type === 'vault' || type === 'store',
      visited: false, engaged: false, introDone: false, bossDead: false,
      chestOpened: false, stock: null, noteRead: false,
      waves: [], waveIdx: 0, waveDelay: 0,
      rest: type === 'start' && floorIdx > 0,
      seed: (c.ix * 73 + c.iy * 151 + floorIdx * 31) | 0,
      doors: {},
      isStreet: streetSeg,
    };
    reg.mask = shapeMask(reg.shape, w, h, rng);
    regions.push(reg);
    regionByKey.set(key, reg);
  }
  for (const [a, b] of edges) {
    const ra = regionByKey.get(a), rb = regionByKey.get(b);
    if (ra && rb && !ra.doors[dirOf(ra, rb)]) ra.doors[dirOf(ra, rb)] = b;
    if (ra && rb && !rb.doors[dirOf(rb, ra)]) rb.doors[dirOf(rb, ra)] = a;
  }

  // ---- 地图尺寸与雕刻 ----
  const maxX = Math.max(...regions.map(r => r.x0 + r.w)) + 2;
  const maxY = Math.max(...regions.map(r => r.y0 + r.h)) + 2;
  const mapW = maxX, mapH = maxY;
  const grid = new Uint8Array(mapW * mapH);
  const idx = (x, y) => y * mapW + x;
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < mapW && y < mapH) grid[idx(x, y)] = t; };
  const get = (x, y) => (x >= 0 && y >= 0 && x < mapW && y < mapH) ? grid[idx(x, y)] : T.VOID;
  const isFloorT = t => t >= T.FLOOR && t <= T.FLOOR3;

  // 先铺"崖壁/建筑"底
  for (let y = 0; y < mapH; y++) for (let x = 0; x < mapW; x++) set(x, y, T.VOID);
  for (const reg of regions) {
    for (let y = 0; y < reg.h; y++) for (let x = 0; x < reg.w; x++) {
      const inside = reg.mask[y * reg.w + x] === 1;
      const gx = reg.x0 + x, gy = reg.y0 + y;
      if (inside) set(gx, gy, rng.f() < 0.55 ? T.FLOOR : rng.f() < 0.6 ? T.FLOOR2 : T.FLOOR3);
      else set(gx, gy, cfg.wallFill);
    }
  }

  // ---- 走廊（支持拐弯） + 闸门 ----
  const gates = new Map();
  const gateTiles = [];
  const corridors = [];
  const cameras = [];
  const cw = cfg.corridor;
  const done = new Set();
  for (const [a, b] of edges) {
    const pk = [a, b].sort().join('|');
    if (done.has(pk)) continue;
    done.add(pk);
    const ra = regionByKey.get(a), rb = regionByKey.get(b);
    if (!ra || !rb) continue;
    connectRegions(ra, rb, rng, set, cw, gates, gateTiles, corridors, mapW);
  }

  // ---- 公路车流道（公路层） ----
  const lanes = [];
  if (cfg.traffic) {
    // 每段走廊都铺成路，双向车流
    for (const co of corridors) {
      if (co.axis === 'h') {
        for (const d of [1, -1]) {
          lanes.push({
            axis: 'h', dir: d,
            y: co.y + (d > 0 ? 1 : 3),
            x0: Math.min(co.x0, co.x1), x1: Math.max(co.x0, co.x1),
            kind: rng.chance(0.3) ? 'truck' : 'car',
            next: rng.range(1.5, 4), gap: rng.range(5, 9),
          });
        }
        // 路面
        for (let x = Math.min(co.x0, co.x1); x <= Math.max(co.x0, co.x1); x++) {
          for (let y = co.y; y <= co.y + 4; y++) {
            if (get(x, y) === T.FLOOR || get(x, y) === T.FLOOR2 || get(x, y) === T.FLOOR3) set(x, y, T.ROAD);
          }
        }
      } else {
        for (const d of [1, -1]) {
          lanes.push({
            axis: 'v', dir: d,
            x: co.x + (d > 0 ? 1 : 3),
            y0: Math.min(co.y0, co.y1), y1: Math.max(co.y0, co.y1),
            kind: 'car',
            next: rng.range(1.5, 4), gap: rng.range(5, 9),
          });
        }
        for (let y = Math.min(co.y0, co.y1); y <= Math.max(co.y0, co.y1); y++) {
          for (let x = co.x; x <= co.x + 4; x++) {
            if (get(x, y) === T.FLOOR || get(x, y) === T.FLOOR2 || get(x, y) === T.FLOOR3) set(x, y, T.ROAD);
          }
        }
      }
    }
    // 铁轨：横穿整层（部分层出现），火车是超长编组
    if (rng.chance(0.75)) {
      const reg = regions.find(r => r.type === 'combat') || regions[0];
      const ly = Math.max(2, Math.min(mapH - 4, Math.floor(reg.y0 + reg.h * rng.range(0.35, 0.65))));
      // 整条铁路铺满全图宽度：虚空、崖壁、地面都铺成道床
      for (let x = 0; x < mapW; x++) {
        for (let y = ly; y <= ly + 2; y++) {
          const t = get(x, y);
          if (t === T.GATE) continue;                 // 不动闸门
          if (t >= T.COLUMN && t !== T.ROAD) continue; // 不动障碍
          set(x, y, T.RAILS);
        }
      }
      lanes.push({
        axis: 'h', dir: rng.chance(0.5) ? 1 : -1, y: ly + 1,
        x0: 0, x1: mapW - 1, kind: 'train', rail: true,
        cars: rng.int(38, 58),                        // 约 2-3 屏长
        next: rng.range(6, 11), gap: rng.range(16, 24),
      });
    }
  }

  // ---- 墙体围裙：给走廊与房间外侧铺 2 圈墙，避免"走廊悬在黑色虚空里" ----
  for (let round = 0; round < 2; round++) {
    const toFill = [];
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        if (get(x, y) !== T.VOID) continue;
        let adj = false;
        for (let dy = -1; dy <= 1 && !adj; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;
            if (get(nx, ny) !== T.VOID) { adj = true; break; }
          }
        }
        if (adj) toFill.push([x, y]);
      }
    }
    for (const [x, y] of toFill) set(x, y, cfg.wallFill);
  }

  // ---- 墙面装饰 ----
  const cityStage = Math.min(3, (G.meta && G.meta.stats ? G.meta.stats.wins : 0) || 0);
  const wallTable = { ...(biome.walls || {}) };
  if (cityStage >= 2) wallTable.banner = (wallTable.banner || 0) + 0.03 * cityStage;
  if (cityStage >= 1) wallTable.graffiti = (wallTable.graffiti || 0) + 0.02 * cityStage;
  for (let y = 0; y < mapH; y++) for (let x = 0; x < mapW; x++) {
    if (get(x, y) !== T.WALL) continue;
    const v = pickWallVariant(rng, wallTable);
    if (v !== T.WALL) set(x, y, v);
  }

  // ---- 障碍 / 陈设 / 地面痕迹 ----
  const nearGate = (x, y) => gateTiles.some(g => Math.abs(g.x - x) <= 2 && Math.abs(g.y - y) <= 2);
  const inMask = (reg, x, y) => {
    const lx = x - reg.x0, ly = y - reg.y0;
    return lx >= 0 && ly >= 0 && lx < reg.w && ly < reg.h && reg.mask[ly * reg.w + lx] === 1;
  };
  // 室内/议事厅：给房间分配主题
  if (biomeId === 'indoor' || biomeId === 'council') {
    for (const reg of regions) {
      if (reg.type === 'boss') continue;
      if (reg.type === 'start') reg.theme = 'lobby';
      else if (reg.type === 'shop') reg.theme = 'breakroom';
      else if (reg.type === 'treasure' || reg.type === 'vault') reg.theme = 'archive';
      else reg.theme = rng.pick(INDOOR_THEMES);
    }
  }
  for (const reg of regions) {
    if (reg.type === 'vault') {
      // 库房：三只木箱 + 零件堆
      const cx = Math.floor(reg.cx), cy = Math.floor(reg.cy);
      for (const [dx, dy] of [[-2, -1], [2, -1], [0, 2]]) {
        if (isFloorT(get(cx + dx, cy + dy))) set(cx + dx, cy + dy, T.CRATE);
      }
      continue;
    }
    if (reg.type === 'boss') {
      const cx = Math.floor(reg.cx), cy = Math.floor(reg.cy);
      for (const [dx, dy] of [[-10, -6], [9, -6], [-10, 6], [9, 6]]) {
        if (get(cx + dx, cy + dy) !== T.VOID) {
          set(cx + dx, cy + dy, T.COLUMN); set(cx + dx + 1, cy + dy, T.COLUMN);
        }
      }
      const carpet = biomeId === 'council';
      for (let x = reg.x0 + 2; x < reg.x0 + reg.w - 2; x++) {
        for (let y = cy - 2; y <= cy + 2; y++) {
          if (!isFloorT(get(x, y))) continue;
          if (carpet) set(x, y, T.CARPET);
        }
      }
      if (!carpet) {
        for (let i = 0; i < 14; i++) {
          const x = cx + rng.int(-9, 9), y = cy + rng.int(-6, 6);
          if (isFloorT(get(x, y))) set(x, y, rng.chance(0.5) ? T.SCORCH : T.SHELLS);
        }
      }
      continue;
    }
    // 主题房已经摆好了家具，不再叠加随机障碍；其余房间也降一点密度
    const themed = (biomeId === 'indoor' || biomeId === 'council') && reg.theme;
    let n = themed ? 0
      : reg.type === 'combat' || reg.isStreet ? rng.int(3, 6)
        : reg.type === 'elite' ? rng.int(2, 4) : rng.int(0, 2);
    let tries = 0;
    while (n > 0 && tries++ < 260) {
      const x = reg.x0 + 2 + Math.floor(rng.f() * (reg.w - 4));
      const y = reg.y0 + 2 + Math.floor(rng.f() * (reg.h - 4));
      if (!isFloorT(get(x, y))) continue;
      if (!inMask(reg, x, y)) continue;
      if (nearGate(x, y)) continue;
      if ([get(x - 1, y), get(x + 1, y), get(x, y - 1), get(x, y + 1)].some(v => v >= T.COLUMN && v !== T.ROAD && v !== T.RAILS)) continue;
      set(x, y, OBSTACLE_TILE[rng.pick(biome.obstacleTiles)]);
      n--;
    }
    const cx2 = Math.floor(reg.cx), cy2 = Math.floor(reg.cy);
    // 室内/议事厅：主题化陈设（在随机障碍之前摆好，显得有规划）
    if ((biomeId === 'indoor' || biomeId === 'council') && reg.theme) {
      dressIndoor(reg, rng, set, get);
    }
    // 街道：路灯（可打灭）+ 可进出的小店
    if (biomeId === 'street') {
      if (reg.isStreet || reg.type === 'start') {
        for (let x = reg.x0 + 2; x < reg.x0 + reg.w - 2; x += 9) {
          setIfFloor(set, get, x, reg.y0 + 1, T.LAMP);
        }
      }
      if (reg.type === 'store') {
        for (let i = -2; i <= 2; i++) setIfFloor(set, get, cx2 + i, cy2 - 2, T.DESK);        // 货架
        for (let i = -2; i <= 2; i += 2) setIfFloor(set, get, cx2 + i, cy2 + 2, T.MEETING);  // 柜台
        setIfFloor(set, get, cx2 - 3, cy2 + 2, T.CRATE);
        setIfFloor(set, get, cx2 + 3, cy2 + 2, T.TRASH);
        setIfFloor(set, get, cx2 - 3, cy2 - 2, T.PLANTT);
      }
    }
    // 监控摄像头（室内/议事厅的战斗房）
    if ((biomeId === 'indoor' || biomeId === 'council')
      && (reg.type === 'combat' || reg.type === 'elite' || reg.type === 'boss')
      && rng.chance(reg.type === 'boss' ? 0.9 : 0.7)) {
      const s = findFloorTile(reg, rng);
      if (s) {
        cameras.push({
          x: s.x * TS + 8, y: s.y * TS + 6, base: rng.f() * Math.PI * 2,
          sweep: rng.range(0.5, 0.9), t: rng.f() * 6, range: 118,
          hp: 8, dead: false, region: reg.key, flash: 0,
        });
      }
    }
    if (reg.type === 'shop') {
      for (let i = -3; i <= 3; i++) {
        const x = cx2 + i, y = cy2 + 3;
        if (isFloorT(get(x, y)) && inMask(reg, x, y)) set(x, y, T.DESK);
      }
    } else if (reg.type === 'treasure') {
      for (const [dx, dy] of [[-4, -2], [4, -2], [-4, 3], [4, 3]]) {
        if (isFloorT(get(cx2 + dx, cy2 + dy))) set(cx2 + dx, cy2 + dy, T.CRATE);
      }
    }
    const decals = biome.decalTiles || [];
    if (decals.length) {
      const dn = reg.type === 'combat' || reg.type === 'elite' ? rng.int(5, 11) : rng.int(2, 5);
      for (let i = 0; i < dn; i++) {
        const x = reg.x0 + 2 + Math.floor(rng.f() * (reg.w - 4));
        const y = reg.y0 + 2 + Math.floor(rng.f() * (reg.h - 4));
        if (!isFloorT(get(x, y)) || !inMask(reg, x, y)) continue;
        set(x, y, DECAL_TILE[rng.pick(decals)]);
      }
    }
  }

  // ---- 波次 ----
  for (const reg of regions) {
    const pickType = () => rng.pick(biome.pool);
    if (reg.type === 'combat' || reg.isStreet) {
      const nWaves = biomeId === 'street' ? 2 : rng.int(2, 3);
      for (let w = 0; w < nWaves; w++) {
        const n = 3 + Math.min(3, floorIdx) + (w === nWaves - 1 ? 1 : 0);
        const wave = [];
        for (let i = 0; i < n; i++) wave.push({ id: pickType(), elite: false });
        if (w === nWaves - 1 && rng.chance(0.18)) wave.push({ id: rng.pick(biome.elitePool), elite: true });
        reg.waves.push(wave);
      }
    } else if (reg.type === 'elite') {
      reg.waves.push([{ id: rng.pick(biome.elitePool), elite: true }, { id: pickType(), elite: false }, { id: pickType(), elite: false }]);
      if (floorIdx > 0) reg.waves.push([{ id: pickType(), elite: false }, { id: pickType(), elite: false }]);
    } else if (reg.type === 'boss') {
      reg.waves.push([{ id: biome.bossId, elite: false, boss: true }]);
    } else if (reg.type === 'vault' || reg.type === 'store') {
      reg.waves = [];
      reg.cleared = true;
    }
  }

  // ---- 垂直层次 / 快捷通道 ----
  const startReg = regionByKey.get(layout.START);
  const travelPairs = [];      // {a,b,kind} 成对的传送点
  const elevatorStops = [];    // 电梯停靠区域
  if (biomeId === 'indoor' || biomeId === 'council') {
    // 挑 1-2 个房间作为地下一层（B1），与它上方的楼层用楼梯相连
    const cand = regions.filter(r => r !== startReg && r.key !== bossKey && (r.type === 'combat' || r.type === 'elite' || r.type === 'vault'));
    const lows = rng.shuffle(cand).slice(0, Math.min(2, cand.length));
    for (const lo of lows) {
      lo.level = 1;
      lo.theme = lo.theme || 'server';
      const upReg = Object.values(lo.doors).map(k => regionByKey.get(k)).filter(r => r && (r.level || 0) === 0)[0];
      if (upReg) travelPairs.push({ a: upReg.key, b: lo.key, kind: 'stairs' });
    }
    elevatorStops.push(layout.START, bossKey);
    const mid = regions.find(r => (r.type === 'shop' || r.type === 'treasure' || r.type === 'elite') && r.key !== bossKey);
    if (mid) elevatorStops.push(mid.key);
  }
  if (biomeId === 'street') {
    // 天桥 / 下水道：成对的两处街段互穿
    const cand = rng.shuffle(regions.filter(r => (r.isStreet || r.type === 'combat') && r.key !== bossKey));
    if (cand.length >= 2) travelPairs.push({ a: cand[0].key, b: cand[1].key, kind: 'overpass' });
    if (cand.length >= 4) travelPairs.push({ a: cand[2].key, b: cand[3].key, kind: 'manhole' });
  }

  return {
    grid, w: mapW, h: mapH,
    biomeId, floorIdx,
    regions, regionByKey,
    startKey: layout.START, bossKey,
    gates, lockedRegions: new Set(), engagedRegion: null,
    enemies: [], pickups: [], props: [],
    lanes, traffic: [],
    cameras, travelPairs, elevatorStops,
    hp: new Map(), breakQueue: [],
    bannerT: 0, time: 0,
    type: 'floor', key: 'floor',
  };
}

function dirOf(a, b) {
  if (b.gx > a.gx) return 'e';
  if (b.gx < a.gx) return 'w';
  if (b.gy > a.gy) return 's';
  return 'n';
}

// 连接两个区域：找到各自可靠的开口，挖走廊（必要时拐弯）
function connectRegions(ra, rb, rng, set, cw, gates, gateTiles, corridors, mapW) {
  const half = Math.floor(cw / 2);
  const horizontal = Math.abs(rb.cx - ra.cx) > Math.abs(rb.cy - ra.cy);
  if (horizontal) {
    const leftIsA = ra.cx < rb.cx;
    const A = leftIsA ? ra : rb, B = leftIsA ? rb : ra;
    const ay = A.y0 + findOpening(A.mask, A.w, A.h, 'e');
    const by = B.y0 + findOpening(B.mask, B.w, B.h, 'w');
    const lead = Math.floor((B.x0 - (A.x0 + A.w - 1)) / 2);
    const midX = A.x0 + A.w - 1 + Math.max(1, lead);
    carveH(set, A.x0 + A.w - 1, midX, ay, half);
    carveV(set, midX, ay, by, half);
    carveH(set, midX, B.x0, by, half);
    gateOn(set, gates, gateTiles, A, ay, half, 'e', mapW);
    gateOn(set, gates, gateTiles, B, by, half, 'w', mapW);
    corridors.push({ axis: 'h', y: ay - half, x0: A.x0 + A.w - 1, x1: B.x0 });
  } else {
    const topIsA = ra.cy < rb.cy;
    const A = topIsA ? ra : rb, B = topIsA ? rb : ra;
    const ax = A.x0 + findOpening(A.mask, A.w, A.h, 's');
    const bx = B.x0 + findOpening(B.mask, B.w, B.h, 'n');
    const midY = A.y0 + A.h - 1 + Math.max(1, Math.floor((B.y0 - (A.y0 + A.h - 1)) / 2));
    carveV(set, ax, A.y0 + A.h - 1, midY, half);
    carveH(set, ax, midY, bx, half);
    carveV(set, bx, midY, B.y0, half);
    gateOn(set, gates, gateTiles, A, ax, half, 's', mapW);
    gateOn(set, gates, gateTiles, B, bx, half, 'n', mapW);
    corridors.push({ axis: 'v', x: ax - half, y0: A.y0 + A.h - 1, y1: B.y0 });
  }
}

function carveH(set, x0, x1, y, half) {
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  for (let x = a; x <= b; x++) for (let dy = -half; dy <= half; dy++) set(x, y + dy, T.FLOOR);
}
function carveV(set, x, y0, y1, half) {
  const a = Math.min(y0, y1), b = Math.max(y0, y1);
  for (let y = a; y <= b; y++) for (let dx = -half; dx <= half; dx++) set(x + dx, y, T.FLOOR);
}
function gateOn(set, gates, gateTiles, reg, along, half, dir, mapW) {
  for (let d = -half; d <= half; d++) {
    const x = dir === 'e' || dir === 'w' ? (dir === 'e' ? reg.x0 + reg.w - 1 : reg.x0) : along + d;
    const y = dir === 'e' || dir === 'w' ? along + d : (dir === 's' ? reg.y0 + reg.h - 1 : reg.y0);
    set(x, y, T.GATE);
    gates.set(y * mapW + x, reg.key);
    gateTiles.push({ x, y, region: reg.key });
  }
}

// 齐青支线关：旧卫戍营房（室内生成，只保留三处有内容的区域）
export function buildSideMap(seed) {
  const map = buildFloorMap('indoor', 0, seed);
  map.side = true;
  const start = map.regionByKey.get(map.startKey);
  const bossK = map.bossKey;
  const midKey = Object.values(start.doors).find(k => map.regionByKey.get(k).type === 'combat');
  const keep = new Set([start.key, bossK]);
  if (midKey) keep.add(midKey);
  for (const reg of map.regions) {
    if (keep.has(reg.key)) continue;
    reg.type = 'combat';
    reg.waves = [];
    reg.cleared = true;
  }
  if (midKey) map.regionByKey.get(midKey).waves = [[{ id: 'guard', elite: false }, { id: 'swat', elite: false }]];
  const bossReg = map.regionByKey.get(bossK);
  bossReg.type = 'boss';
  bossReg.waves = [[{ id: 'oldcaptain', elite: false, boss: true }]];
  map.keepKeys = keep;
  map.lanes = [];   // 营房没有车流
  return map;
}

// 生成商店货架
export function rollShopStock(rng) {
  const pool = G.meta.weapons.filter(id => WEAPONS[id] && WEAPONS[id].price > 0);
  let weaponId = 'smg';
  if (pool.length) {
    const weighted = pool.map(id => ({ id, w: [3, 2.2, 1.2, 0.5][WEAPONS[id].rarity] }));
    let s = 0; for (const it of weighted) s += it.w;
    let r = rng.f() * s;
    for (const it of weighted) { r -= it.w; if (r <= 0) { weaponId = it.id; break; } }
  }
  const wdef = WEAPONS[weaponId];
  const buffIds = ['maxhp', 'energy', 'dmg', 'rate', 'dashcd', 'speed', 'parts'];
  const buffId = buffIds[Math.floor(rng.f() * buffIds.length)];
  return [
    { kind: 'weapon', id: weaponId, price: [38, 62, 92, 135][wdef.rarity] },
    { kind: 'heal', price: 32 },
    { kind: 'buff', id: buffId, price: 75 },
    { kind: 'skill', id: SKILL_IDS[Math.floor(rng.f() * SKILL_IDS.length)], price: 58 },
  ];
}

// 点所在区域（像素坐标，用包围盒判定）
export function regionAt(map, px, py, inset = 0) {
  for (const reg of map.regions) {
    const x0 = reg.x0 * TS + inset, x1 = (reg.x0 + reg.w) * TS - inset;
    const y0 = reg.y0 * TS + inset, y1 = (reg.y0 + reg.h) * TS - inset;
    if (x1 <= x0 || y1 <= y0) continue;
    if (px >= x0 && px < x1 && py >= y0 && py < y1) return reg;
  }
  return null;
}
