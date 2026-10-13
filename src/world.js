// 世界：瓦片网格、碰撞、房间渲染。房间=单屏 32×18 瓦片。
import { hash2, clamp } from './utils.js';
import { BIOMES } from './data_biomes.js';
import { GRAFFITI } from './data_dialog.js';

export const TS = 16, RW = 32, RH = 18;
export const W = RW * TS, H = RH * TS; // 512×288

export const T = {
  VOID: 0,
  FLOOR: 1, FLOOR2: 2, FLOOR3: 3, CARPET: 4,
  WALL: 10, WALL_WINDOW: 11, WALL_POSTER: 12, WALL_GRAFFITI: 13, WALL_CRACK: 14, WALL_SIGN: 15,
  WALL_NEON: 16, WALL_WHITEBOARD: 17, WALL_PAINTING: 18, WALL_BANNER: 19, WALL_ELEVATOR: 25,
  DOOR_N: 20, DOOR_S: 21, DOOR_E: 22, DOOR_W: 23,
  GATE: 24, // 走廊闸门：所属区域锁定时为实心
  // 大件障碍（实心）
  COLUMN: 30, CRATE: 31, DESK: 32, CAR: 33, RAIL: 34, PUMP: 35, SAND: 36, RUBBLE: 37, CROSSWALK: 38, HYDRANT: 39,
  MEETING: 40, CABINET: 41, COOLER: 42, VENDM: 43, TRASH: 44, BOOTH: 45, MAILBOX: 46,
  TIERS: 47, DEADTREE: 48, SANDBAG: 49, CAMPFIRE: 55, ROADSIGN: 56, STALL: 57, PLANTT: 58,
  // 地面痕迹（可通行）
  PUDDLE: 50, BLOOD: 51, SHELLS: 52, CONE: 53, GRATE: 54, SCORCH: 59,
  // 公路层：路面与铁轨（可通行）
  ROAD: 60, RAILS: 61,
  // 可破坏 / 特殊
  GLASS: 62, LAMP: 63, BROKEN_LAMP: 64,
};

// 可破坏瓦片：hp / 掉落零件 / 破坏后变成什么 / 特殊效果
export const DESTRUCTIBLE = {
  [T.CRATE]: { hp: 12, parts: [3, 7], become: T.FLOOR },
  [T.DESK]: { hp: 10, parts: [2, 4], become: T.FLOOR },
  [T.MEETING]: { hp: 16, parts: [4, 8], become: T.FLOOR },
  [T.CABINET]: { hp: 14, parts: [3, 6], note: 0.3, become: T.FLOOR },
  [T.COOLER]: { hp: 8, parts: [2, 4], splash: true, become: T.FLOOR },
  [T.VENDM]: { hp: 18, loot: true, alarm: true, become: T.FLOOR },
  [T.TRASH]: { hp: 6, parts: [2, 4], junk: true, become: T.FLOOR },
  [T.MAILBOX]: { hp: 6, parts: [2, 3], become: T.FLOOR },
  [T.PLANTT]: { hp: 6, parts: [1, 2], become: T.FLOOR },
  [T.SANDBAG]: { hp: 22, become: T.FLOOR },
  [T.TIERS]: { hp: 14, become: T.FLOOR },
  [T.CAR]: { hp: 28, explode: 48, dmg: 14, parts: [8, 14], become: T.SCORCH },
  [T.GLASS]: { hp: 1, through: true, become: T.FLOOR },
  [T.LAMP]: { hp: 6, parts: [1, 2], become: T.BROKEN_LAMP },
  [T.WALL_NEON]: { hp: 8, parts: [1, 2], become: T.WALL },
};

const WALL_TILES = new Set([T.WALL, T.WALL_WINDOW, T.WALL_POSTER, T.WALL_GRAFFITI, T.WALL_CRACK, T.WALL_SIGN,
  T.WALL_NEON, T.WALL_WHITEBOARD, T.WALL_PAINTING, T.WALL_BANNER, T.WALL_ELEVATOR]);

const SOLID_TILES = new Set([...WALL_TILES,
  T.COLUMN, T.CRATE, T.DESK, T.CAR, T.RAIL, T.PUMP, T.RUBBLE, T.HYDRANT,
  T.MEETING, T.CABINET, T.COOLER, T.VENDM, T.TRASH, T.BOOTH, T.MAILBOX,
  T.TIERS, T.DEADTREE, T.SANDBAG, T.CAMPFIRE, T.ROADSIGN, T.STALL, T.PLANTT,
  T.GLASS, T.LAMP]);

// 发光/动态瓦片（环境光晕用）
export const GLOW_TILES = new Set([T.CAMPFIRE, T.WALL_NEON, T.PUMP, T.BOOTH, T.VENDM, T.LAMP]);

export function isWallTile(t) { return WALL_TILES.has(t); }

export function tileAt(room, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return T.VOID;
  return room.grid[ty * room.w + tx];
}

export function isSolid(room, tx, ty) {
  const t = tileAt(room, tx, ty);
  if (t === T.VOID) return true;   // 黑色虚空不可通行（地图外/未开凿区域）
  if (t === T.GATE) {
    const reg = room.gates && room.gates.get(ty * room.w + tx);
    return !!(reg && room.lockedRegions && room.lockedRegions.has(reg));
  }
  return SOLID_TILES.has(t);
}

export function solidAtPx(room, px, py) {
  return isSolid(room, Math.floor(px / TS), Math.floor(py / TS));
}

// 矩形实体（中心 x,y 半径 r）与瓦片碰撞的轴分离移动
export function moveEntity(room, e, dx, dy) {
  const r = e.r;
  if (dx !== 0) {
    e.x += dx;
    const dirX = dx > 0 ? e.x + r : e.x - r;
    if (solidAtPx(room, dirX, e.y - r + 1) || solidAtPx(room, dirX, e.y) || solidAtPx(room, dirX, e.y + r - 1)) {
      e.x = dx > 0 ? Math.floor(dirX / TS) * TS - r - 0.01 : (Math.floor(dirX / TS) + 1) * TS + r + 0.01;
    }
  }
  if (dy !== 0) {
    e.y += dy;
    const dirY = dy > 0 ? e.y + r : e.y - r;
    if (solidAtPx(room, e.x - r + 1, dirY) || solidAtPx(room, e.x, dirY) || solidAtPx(room, e.x + r - 1, dirY)) {
      e.y = dy > 0 ? Math.floor(dirY / TS) * TS - r - 0.01 : (Math.floor(dirY / TS) + 1) * TS + r + 0.01;
    }
  }
}

// 实体是否会与瓦片重叠（用于生成位置校验）
export function entityFits(room, x, y, r) {
  return !solidAtPx(room, x - r, y - r) && !solidAtPx(room, x + r, y - r) &&
    !solidAtPx(room, x - r, y + r) && !solidAtPx(room, x + r, y + r);
}

// 视线检测（步进 8px）
export function hasLOS(room, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(d / 8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solidAtPx(room, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

// 门位置：N/S 在 tx 15,16；E/W 在 ty 8,9
export const DOOR_POS = {
  n: [{ x: 15, y: 0 }, { x: 16, y: 0 }],
  s: [{ x: 15, y: 17 }, { x: 16, y: 17 }],
  w: [{ x: 0, y: 8 }, { x: 0, y: 9 }],
  e: [{ x: 31, y: 8 }, { x: 31, y: 9 }],
};
export const DOOR_ENTER = { // 从某方向门进入房间时的落点（世界像素）
  n: { x: 15.5 * TS, y: 1.6 * TS },
  s: { x: 15.5 * TS, y: 16.4 * TS },
  w: { x: 1.6 * TS, y: 8.5 * TS },
  e: { x: 30.4 * TS, y: 8.5 * TS },
};

// ---------- 房间渲染 ----------
function drawFloorTile(ctx, biome, t, px, py, gx, gy) {
  const h = hash2(gx, gy, 7);
  if (t === T.CARPET) {
    // 议事厅红毯
    ctx.fillStyle = '#6e2230';
    ctx.fillRect(px, py, TS, TS);
    ctx.fillStyle = 'rgba(232,193,85,0.22)';
    ctx.fillRect(px, py + 7, TS, 1);
    if (h > 0.8) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px + 3, py + 3, 4, 2); }
    return;
  }
  ctx.fillStyle = t === T.FLOOR2 ? biome.floor[1] : t === T.FLOOR3 ? biome.floor[2] : biome.floor[0];
  ctx.fillRect(px, py, TS, TS);
  if (biome.id === 'indoor') {
    // 室内：细木板条（竖缝 + 交错横缝 + 木纹）
    ctx.fillStyle = biome.grout;
    const off = (gy % 2) * 8;
    ctx.fillRect(px, py + 7, TS, 1);
    ctx.fillRect(px + ((off + 4) % 16), py, 1, 7);
    ctx.fillRect(px + ((off + 12) % 16), py, 1, 7);
    ctx.fillRect(px + ((off + 8) % 16), py + 8, 1, 8);
    if (h > 0.62) {
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fillRect(px + 2, py + 2 + Math.floor(h * 8) % 10, 7, 1);
      ctx.fillRect(px + 9, py + 11 - Math.floor(h * 5) % 6, 5, 1);
    }
    if (h > 0.93) { ctx.fillStyle = biome.floorAccent; ctx.fillRect(px + 4, py + 4, 3, 2); }
  } else if (biome.id === 'council') {
    // 议事厅：大理石拼缝 + 倒影
    ctx.fillStyle = biome.grout;
    ctx.fillRect(px, py + 15, TS, 1);
    ctx.fillRect(px + 15, py, 1, TS);
    if (h > 0.75) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px + 2, py + 2, 6, 5); }
  } else if (biome.id === 'street') {
    // 柏油 + 裂缝/井盖
    if (h > 0.9) {
      ctx.strokeStyle = biome.floorAccent; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(px + 3, py + 2); ctx.lineTo(px + 8, py + 9); ctx.lineTo(px + 6, py + 14); ctx.stroke();
    } else if (h > 0.84) {
      ctx.fillStyle = biome.floorAccent; ctx.beginPath(); ctx.arc(px + 8, py + 8, 3, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2e2e36'; ctx.stroke();
    }
  } else {
    // 公路：龟裂 + 补丁
    if (h > 0.88) { ctx.fillStyle = biome.floorAccent; ctx.fillRect(px + 2, py + 3, 11, 9); }
    if (h > 0.7 && h < 0.76) {
      ctx.strokeStyle = biome.floorAccent; ctx.beginPath();
      ctx.moveTo(px + 2, py + 12); ctx.lineTo(px + 9, py + 6); ctx.lineTo(px + 13, py + 10); ctx.stroke();
    }
  }
}

function drawWallTile(ctx, biome, t, px, py, gx, gy, time = 0) {
  ctx.fillStyle = biome.wall;
  ctx.fillRect(px, py, TS, TS);
  ctx.fillStyle = biome.wallTop;
  ctx.fillRect(px, py, TS, 3);
  ctx.fillStyle = biome.wallLine;
  ctx.fillRect(px, py + 3, TS, 1);
  // 砖缝
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  const off = (gy % 2) * 4;
  for (let bx = off; bx < TS; bx += 8) ctx.fillRect(px + bx, py + 4, 1, TS - 4);
  ctx.fillRect(px, py + 10, TS, 1);
  const h = hash2(gx, gy, 13);
  if (t === T.WALL_WINDOW) {
    ctx.fillStyle = '#1a1c26'; ctx.fillRect(px + 2, py + 5, 12, 8);
    ctx.fillStyle = '#2c3348'; ctx.fillRect(px + 3, py + 6, 4, 6);
    ctx.fillStyle = biome.wallLine; ctx.fillRect(px + 8, py + 5, 1, 8); ctx.fillRect(px + 2, py + 9, 12, 1);
  } else if (t === T.WALL_POSTER) {
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(px + 3, py + 5, 9, 9);
    ctx.fillStyle = '#a03a44'; ctx.fillRect(px + 4, py + 6, 7, 3);
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(px + 4, py + 10, 7, 1); ctx.fillRect(px + 4, py + 12, 5, 1);
  } else if (t === T.WALL_GRAFFITI) {
    const cols = ['#e05540', '#e8c14a', '#6ac07a', '#6aa9e8'];
    ctx.fillStyle = cols[Math.floor(h * 4) % 4];
    for (let i = 0; i < 6; i++) ctx.fillRect(px + 2 + Math.floor(hash2(gx, gy, i) * 11), py + 5 + Math.floor(hash2(gy, gx, i) * 8), 2, 2);
  } else if (t === T.WALL_CRACK) {
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath();
    ctx.moveTo(px + 4, py + 4); ctx.lineTo(px + 8, py + 9); ctx.lineTo(px + 6, py + 14); ctx.stroke();
  } else if (t === T.WALL_SIGN) {
    ctx.fillStyle = '#2e3a52'; ctx.fillRect(px + 2, py + 6, 12, 6);
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(px + 3, py + 8, 10, 1); ctx.fillRect(px + 3, py + 10, 6, 1);
  } else if (t === T.WALL_NEON) {
    // 霓虹招牌（呼吸闪烁）
    const on = 0.55 + Math.sin(time * 3 + h * 6) * 0.25 + Math.sin(time * 11 + h * 20) * 0.08;
    const c = ['#e0557a', '#6fe8e0', '#e8c14a', '#8a7ae8'][Math.floor(h * 4) % 4];
    ctx.globalAlpha = Math.max(0.25, on);
    ctx.fillStyle = c;
    ctx.fillRect(px + 2, py + 6, 12, 2);
    ctx.fillRect(px + 3, py + 9, 10, 2);
    ctx.fillRect(px + 5, py + 12, 6, 1);
    ctx.globalAlpha = 1;
  } else if (t === T.WALL_WHITEBOARD) {
    ctx.fillStyle = '#e6e6e0'; ctx.fillRect(px + 2, py + 5, 12, 9);
    ctx.fillStyle = '#8a8a92';
    ctx.fillRect(px + 3, py + 7, 7, 1); ctx.fillRect(px + 3, py + 9, 9, 1); ctx.fillRect(px + 3, py + 11, 5, 1);
    ctx.fillStyle = '#c04a3a'; ctx.fillRect(px + 10, py + 10, 3, 3);
  } else if (t === T.WALL_PAINTING) {
    ctx.fillStyle = '#8a6a42'; ctx.fillRect(px + 2, py + 4, 12, 11);
    ctx.fillStyle = '#2e3448'; ctx.fillRect(px + 3, py + 5, 10, 9);
    ctx.fillStyle = h > 0.5 ? '#8c6a4a' : '#4a657a';
    ctx.fillRect(px + 4, py + 9, 8, 4);
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(px + 5, py + 6, 2, 2);
  } else if (t === T.WALL_BANNER) {
    // 横幅（革命口号布条）
    ctx.fillStyle = '#8c2f3a'; ctx.fillRect(px + 1, py + 3, 14, 12);
    ctx.fillStyle = '#6e2230'; ctx.fillRect(px + 1, py + 3, 14, 2);
    ctx.fillStyle = '#d8d0c0';
    ctx.fillRect(px + 3, py + 7, 10, 1); ctx.fillRect(px + 4, py + 10, 8, 1);
    ctx.fillStyle = '#e8c14a'; ctx.fillRect(px + 6, py + 12, 4, 1);
  } else if (t === T.WALL_ELEVATOR) {
    ctx.fillStyle = '#5a6069'; ctx.fillRect(px + 1, py + 3, 14, 12);
    ctx.fillStyle = '#3a3f46'; ctx.fillRect(px + 2, py + 4, 5, 10); ctx.fillRect(px + 9, py + 4, 5, 10);
    ctx.fillStyle = '#c04a3a'; ctx.fillRect(px + 11, py + 6, 2, 2);
    ctx.fillStyle = '#8a8a92'; ctx.fillRect(px + 3, py + 6, 3, 6); ctx.fillRect(px + 10, py + 6, 3, 6);
  }
}

function drawObstacle(ctx, biome, t, px, py, gx, gy, time = 0) {
  const h = hash2(gx, gy, 21);
  switch (t) {
    case T.COLUMN:
      ctx.fillStyle = '#6a625a'; ctx.fillRect(px + 2, py, 12, TS);
      ctx.fillStyle = '#7e766c'; ctx.fillRect(px + 3, py, 3, TS);
      ctx.fillStyle = '#524c44'; ctx.fillRect(px + 12, py, 2, TS);
      break;
    case T.CRATE:
      ctx.fillStyle = h > 0.5 ? '#7a5c38' : '#6e5233'; ctx.fillRect(px + 1, py + 1, 14, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 1, py + 1, 14, 2); ctx.fillRect(px + 7, py + 1, 2, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px + 1, py + 13, 14, 2);
      break;
    case T.DESK:
      ctx.fillStyle = '#5d4a30'; ctx.fillRect(px, py + 2, TS, 12);
      ctx.fillStyle = '#6e5a3c'; ctx.fillRect(px, py + 2, TS, 3);
      ctx.fillStyle = '#d8d0c0'; ctx.fillRect(px + 3, py + 7, 4, 3); // 文件
      ctx.fillStyle = '#3a3a44'; ctx.fillRect(px + 9, py + 6, 3, 5); // 显示器
      break;
    case T.CAR:
      ctx.fillStyle = h > 0.5 ? '#7a3a38' : '#3e5568'; ctx.fillRect(px, py + 2, TS, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 2, py + 4, 12, 8);
      ctx.fillStyle = h > 0.5 ? '#8c4a46' : '#4a657a'; ctx.fillRect(px + 1, py + 3, 14, 10);
      ctx.fillStyle = '#1a1c26'; ctx.fillRect(px + 3, py + 5, 4, 7); ctx.fillRect(px + 9, py + 5, 4, 7);
      ctx.fillStyle = '#2e2e36'; ctx.fillRect(px, py + 1, 3, 2); ctx.fillRect(px + 13, py + 1, 3, 2);
      ctx.fillRect(px, py + 13, 3, 2); ctx.fillRect(px + 13, py + 13, 3, 2);
      break;
    case T.RAIL:
      ctx.fillStyle = '#8a8a92'; ctx.fillRect(px, py + 6, TS, 4);
      ctx.fillStyle = '#6a6a72'; ctx.fillRect(px, py + 6, TS, 1);
      ctx.fillStyle = '#55555d'; ctx.fillRect(px + 2, py + 10, 3, 4); ctx.fillRect(px + 11, py + 10, 3, 4);
      break;
    case T.PUMP:
      ctx.fillStyle = '#a03a44'; ctx.fillRect(px + 3, py + 2, 10, 13);
      ctx.fillStyle = '#e8e4da'; ctx.fillRect(px + 5, py + 4, 6, 4);
      ctx.fillStyle = '#131318'; ctx.fillRect(px + 5, py + 10, 6, 2);
      break;
    case T.RUBBLE:
      ctx.fillStyle = '#55504a';
      ctx.fillRect(px + 2, py + 8, 5, 4); ctx.fillRect(px + 8, py + 4, 4, 3); ctx.fillRect(px + 10, py + 10, 4, 3);
      ctx.fillStyle = '#3e3a36'; ctx.fillRect(px + 4, py + 10, 3, 2); ctx.fillRect(px + 9, py + 6, 2, 2);
      break;
    case T.HYDRANT:
      ctx.fillStyle = '#a03a44'; ctx.fillRect(px + 5, py + 4, 6, 10);
      ctx.fillStyle = '#c04a4a'; ctx.fillRect(px + 4, py + 6, 8, 2); ctx.fillRect(px + 7, py + 2, 2, 3);
      break;
    // ---- 会议/办公 ----
    case T.MEETING:
      ctx.fillStyle = '#4a3423'; ctx.fillRect(px, py + 1, TS, 14);
      ctx.fillStyle = '#5d4229'; ctx.fillRect(px, py + 1, TS, 4);
      ctx.fillStyle = '#d8d0c0'; ctx.fillRect(px + 2, py + 6, 4, 3); ctx.fillRect(px + 10, py + 6, 4, 3);
      ctx.fillStyle = '#8a8a92'; ctx.fillRect(px + 7, py + 11, 2, 2);
      break;
    case T.CABINET:
      ctx.fillStyle = '#4a5058'; ctx.fillRect(px + 2, py, 12, TS);
      ctx.fillStyle = '#5c636c'; ctx.fillRect(px + 3, py + 1, 10, 6); ctx.fillRect(px + 3, py + 9, 10, 6);
      ctx.fillStyle = '#c8a04a'; ctx.fillRect(px + 6, py + 3, 4, 1); ctx.fillRect(px + 6, py + 11, 4, 1);
      break;
    case T.COOLER:
      ctx.fillStyle = '#d8d8d4'; ctx.fillRect(px + 4, py + 3, 8, 12);
      ctx.fillStyle = '#5aa8d8'; ctx.fillRect(px + 5, py + 1, 6, 5);
      ctx.fillStyle = '#3a7aa8'; ctx.fillRect(px + 6, py + 7, 4, 4);
      break;
    case T.VENDM:
      ctx.fillStyle = h > 0.5 ? '#3a6a8c' : '#a03a44'; ctx.fillRect(px + 2, py + 1, 12, 14);
      ctx.fillStyle = '#1a1c26'; ctx.fillRect(px + 3, py + 2, 6, 9);
      ctx.fillStyle = '#e8e4da'; ctx.fillRect(px + 10, py + 3, 3, 4);
      ctx.fillStyle = '#e8c14a'; ctx.fillRect(px + 3, py + 12, 10, 2);
      break;
    // ---- 街道 ----
    case T.TRASH:
      ctx.fillStyle = '#4a5058'; ctx.fillRect(px + 4, py + 4, 8, 11);
      ctx.fillStyle = '#5c636c'; ctx.fillRect(px + 3, py + 2, 10, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 4, py + 8, 8, 1);
      break;
    case T.BOOTH:
      ctx.fillStyle = '#8c2f3a'; ctx.fillRect(px + 3, py, 10, TS);
      ctx.fillStyle = '#a03a44'; ctx.fillRect(px + 4, py + 1, 8, 5);
      ctx.fillStyle = '#1a1c26'; ctx.fillRect(px + 5, py + 7, 6, 5);
      ctx.globalAlpha = 0.5 + Math.sin(time * 3 + h * 9) * 0.2;
      ctx.fillStyle = '#f2d98a'; ctx.fillRect(px + 6, py + 2, 4, 2);
      ctx.globalAlpha = 1;
      break;
    case T.MAILBOX:
      ctx.fillStyle = '#3a5a8c'; ctx.fillRect(px + 4, py + 3, 8, 8);
      ctx.fillStyle = '#4a6a9c'; ctx.fillRect(px + 4, py + 3, 8, 3);
      ctx.fillStyle = '#2e2620'; ctx.fillRect(px + 7, py + 11, 2, 5);
      ctx.fillStyle = '#d8d0c0'; ctx.fillRect(px + 6, py + 6, 4, 1);
      break;
    case T.STALL:
      ctx.fillStyle = '#6e5233'; ctx.fillRect(px, py + 7, TS, 9);
      ctx.fillStyle = '#8c4a46'; ctx.fillRect(px, py, TS, 6);
      ctx.fillStyle = '#e8e4da'; ctx.fillRect(px + 2, py + 1, 3, 4); ctx.fillRect(px + 8, py + 1, 3, 4);
      ctx.fillStyle = '#d8a04a'; ctx.fillRect(px + 3, py + 10, 3, 3); ctx.fillRect(px + 9, py + 11, 3, 2);
      break;
    // ---- 公路 ----
    case T.TIERS:
      ctx.fillStyle = '#2a2a30'; ctx.fillRect(px + 1, py + 8, 14, 6);
      ctx.fillStyle = '#3a3a42'; ctx.fillRect(px + 3, py + 2, 10, 6);
      ctx.fillStyle = '#1a1a20'; ctx.fillRect(px + 4, py + 4, 8, 2); ctx.fillRect(px + 2, py + 10, 12, 2);
      break;
    case T.DEADTREE:
      ctx.fillStyle = '#5a4632'; ctx.fillRect(px + 7, py + 3, 3, 13);
      ctx.fillRect(px + 3, py + 5, 5, 2); ctx.fillRect(px + 9, py + 2, 5, 2);
      ctx.fillRect(px + 4, py + 1, 2, 4); ctx.fillRect(px + 11, py + 4, 2, 3);
      break;
    case T.SANDBAG:
      ctx.fillStyle = '#8a7a5a'; ctx.fillRect(px + 1, py + 6, 7, 5); ctx.fillRect(px + 8, py + 6, 7, 5);
      ctx.fillRect(px + 4, py + 1, 7, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(px + 1, py + 10, 14, 1);
      break;
    case T.ROADSIGN:
      ctx.fillStyle = '#8a8a92'; ctx.fillRect(px + 7, py + 5, 2, 11);
      ctx.fillStyle = '#2e6a3a'; ctx.fillRect(px + 2, py + 1, 12, 6);
      ctx.fillStyle = '#e8e4da'; ctx.fillRect(px + 4, py + 3, 8, 1); ctx.fillRect(px + 4, py + 5, 5, 1);
      break;
    case T.CAMPFIRE:
      ctx.fillStyle = '#4a3c28'; ctx.fillRect(px + 3, py + 11, 4, 3); ctx.fillRect(px + 9, py + 11, 4, 3);
      ctx.fillStyle = '#5a4a30'; ctx.fillRect(px + 2, py + 9, 12, 3);
      {
        const f = Math.sin(time * 9 + h * 5) * 0.5 + 0.5;
        ctx.fillStyle = '#f2824a';
        ctx.fillRect(px + 5, py + 4 - f * 2, 6, 6 + f * 2);
        ctx.fillStyle = '#f2b05e';
        ctx.fillRect(px + 6, py + 6 - f * 2, 4, 4 + f * 2);
        ctx.fillStyle = '#e8e4da';
        ctx.fillRect(px + 7, py + 8 - f, 2, 2);
      }
      break;
    case T.PLANTT:
      ctx.fillStyle = '#8a5a3a'; ctx.fillRect(px + 4, py + 9, 8, 6);
      ctx.fillStyle = '#6e4a30'; ctx.fillRect(px + 4, py + 9, 8, 2);
      ctx.fillStyle = '#4a7a52';
      ctx.fillRect(px + 3, py + 3, 5, 6); ctx.fillRect(px + 8, py + 4, 5, 5); ctx.fillRect(px + 6, py + 1, 4, 5);
      break;
    // ---- 地面痕迹（可通行） ----
    case T.PUDDLE:
      ctx.fillStyle = 'rgba(90,140,190,0.28)';
      ctx.beginPath(); ctx.ellipse(px + 8, py + 8, 6 + h * 2, 3.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(200,225,255,0.22)';
      ctx.fillRect(px + 5, py + 6, 4, 1);
      break;
    case T.BLOOD:
      ctx.fillStyle = 'rgba(120,30,36,0.45)';
      ctx.beginPath(); ctx.ellipse(px + 8, py + 9, 5 + h * 3, 3, h * 3, 0, 7); ctx.fill();
      ctx.fillRect(px + 11 + Math.floor(h * 3), py + 5, 1, 2);
      break;
    case T.SHELLS:
      ctx.fillStyle = '#c8a04a';
      for (let i = 0; i < 5; i++) ctx.fillRect(px + 3 + Math.floor(hash2(gx, gy, i) * 10), py + 3 + Math.floor(hash2(gy, gx, i) * 10), 2, 1);
      ctx.fillStyle = '#8a8a92';
      for (let i = 0; i < 3; i++) ctx.fillRect(px + 2 + Math.floor(hash2(gx, gy, i + 9) * 12), py + 4 + Math.floor(hash2(gy, gx, i + 9) * 9), 1, 2);
      break;
    case T.CONE:
      ctx.fillStyle = '#e8722a'; ctx.fillRect(px + 6, py + 4, 4, 9);
      ctx.fillStyle = '#d8d0c0'; ctx.fillRect(px + 5, py + 7, 6, 2);
      ctx.fillStyle = '#3a3a42'; ctx.fillRect(px + 4, py + 12, 8, 2);
      break;
    case T.GRATE:
      ctx.fillStyle = '#3a3a42'; ctx.fillRect(px + 2, py + 3, 12, 10);
      ctx.fillStyle = '#2a2a30';
      for (let i = 0; i < 4; i++) ctx.fillRect(px + 3, py + 4 + i * 2, 10, 1);
      break;
    case T.SCORCH:
      ctx.fillStyle = 'rgba(20,18,16,0.5)';
      ctx.beginPath(); ctx.ellipse(px + 8, py + 8, 6, 5, h * 3, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(60,50,40,0.35)';
      ctx.beginPath(); ctx.ellipse(px + 6, py + 6, 3, 2, 0, 0, 7); ctx.fill();
      break;
    case T.ROAD:
      // 沥青路面 + 车道虚线
      ctx.fillStyle = '#3c3c44';
      ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(px, py, TS, 2);
      if (h > 0.72) {
        ctx.fillStyle = 'rgba(232,216,74,0.5)';
        if (gy % 2 === 0) ctx.fillRect(px + 6, py + 6, 4, 2);
        else ctx.fillRect(px + 6, py, 4, 2);
      }
      if (h > 0.95) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 3, py + 9, 6, 3); }
      break;
    case T.RAILS:
      // 碎石道床 + 枕木 + 钢轨
      ctx.fillStyle = '#4a443c';
      ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 4; i++) ctx.fillRect(px + 2 + Math.floor(hash2(gx, gy, i) * 10), py + 3 + i * 3, 3, 2);
      ctx.fillStyle = '#5a4a38';
      ctx.fillRect(px, py + 4, TS, 3);
      ctx.fillRect(px, py + 11, TS, 3);
      ctx.fillStyle = '#9aa0a8';
      ctx.fillRect(px, py + 3, TS, 2);
      ctx.fillRect(px, py + 13, TS, 2);
      break;
    case T.GLASS:
      // 玻璃隔断：半透明 + 反光
      ctx.fillStyle = 'rgba(150,200,220,0.22)';
      ctx.fillRect(px, py, TS, TS);
      ctx.strokeStyle = 'rgba(200,235,245,0.55)';
      ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
      ctx.fillStyle = 'rgba(230,245,255,0.35)';
      ctx.fillRect(px + 2, py + 2, 3, TS - 4);
      ctx.fillRect(px + 8, py + 3, 1, TS - 7);
      break;
    case T.LAMP:
      // 路灯：灯杆 + 灯头
      ctx.fillStyle = '#3a3f46';
      ctx.fillRect(px + 7, py + 4, 3, 12);
      ctx.fillRect(px + 4, py + 2, 9, 3);
      ctx.fillStyle = '#f2e8b0';
      ctx.fillRect(px + 5, py + 4, 7, 2);
      ctx.fillStyle = 'rgba(232,193,85,0.35)';
      ctx.fillRect(px + 4, py + 6, 9, 2);
      break;
    case T.BROKEN_LAMP:
      // 打灭的路灯：残杆 + 碎玻璃
      ctx.fillStyle = '#33373d';
      ctx.fillRect(px + 7, py + 7, 3, 9);
      ctx.fillRect(px + 9, py + 4, 4, 2);
      ctx.fillStyle = 'rgba(180,200,215,0.25)';
      ctx.fillRect(px + 3, py + 12, 3, 2); ctx.fillRect(px + 11, py + 13, 2, 2);
      break;
    default: break;
  }
}

// 在普通地面上留下痕迹（血迹/焦痕），不改动障碍与墙面
export function setDecal(room, x, y, tile) {
  const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return;
  const i = ty * room.w + tx;
  const t = room.grid[i];
  if (t === T.FLOOR || t === T.FLOOR2 || t === T.FLOOR3 || t === T.CARPET) room.grid[i] = tile;
}

export function drawRoom(ctx, room, time, cam = { x: 0, y: 0 }) {
  const biome = BIOMES[room.biomeId];
  const tx0 = Math.max(0, Math.floor(cam.x / TS));
  const ty0 = Math.max(0, Math.floor(cam.y / TS));
  const tx1 = Math.min(room.w - 1, Math.ceil((cam.x + 512) / TS));
  const ty1 = Math.min(room.h - 1, Math.ceil((cam.y + 288) / TS));
  for (let gy = ty0; gy <= ty1; gy++) {
    for (let gx = tx0; gx <= tx1; gx++) {
      const t = room.grid[gy * room.w + gx];
      const px = gx * TS, py = gy * TS;
      if (t === T.VOID) { ctx.fillStyle = '#0a0a0f'; ctx.fillRect(px, py, TS, TS); continue; }
      if (t === T.GATE) {
        const reg = room.gates.get(gy * room.w + gx);
        const locked = reg && room.lockedRegions.has(reg);
        drawFloorTile(ctx, biome, T.FLOOR, px, py, gx, gy);
        if (locked) {
          ctx.fillStyle = '#3a3f46'; ctx.fillRect(px, py, TS, TS);
          ctx.fillStyle = '#2b2f35';
          for (let i = 2; i < TS; i += 4) ctx.fillRect(px, py + i, TS, 1);
          ctx.fillStyle = '#c04a3a';
          ctx.globalAlpha = Math.sin(time * 6) > 0 ? 1 : 0.35;
          ctx.fillRect(px + 6, py + 7, 3, 3);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(px, py, TS, 2);
        }
        continue;
      }
      if (isWallTile(t)) { drawWallTile(ctx, biome, t, px, py, gx, gy, time); continue; }
      drawFloorTile(ctx, biome, t, px, py, gx, gy);
      if (t >= T.COLUMN) drawObstacle(ctx, biome, t, px, py, gx, gy, time);
    }
  }
}
