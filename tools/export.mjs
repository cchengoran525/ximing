// 素材导出：把游戏里所有美术（像素精灵 / 地形瓦片 / 道具 / 载具 / 武器图标）
// 导出成通用 PNG + 图集 + 清单，1x/2x/4x/8x。
// 用法：node tools/export.mjs
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

// ---------- 浏览器环境垫片（游戏模块需要一个 canvas / window / localStorage） ----------
globalThis.window = { addEventListener() {}, innerWidth: 1280, innerHeight: 720 };
globalThis.document = { createElement: () => createCanvas(1, 1) };
globalThis.location = { search: '', href: 'http://localhost/' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outRoot = path.join(root, 'assets');

const { ART } = await import(url.pathToFileURL(path.join(root, 'src/art.js')).href);
const { spr } = await import(url.pathToFileURL(path.join(root, 'src/sprites.js')).href);
const { exportTileTo, T, TS } = await import(url.pathToFileURL(path.join(root, 'src/world.js')).href);
const propsArt = await import(url.pathToFileURL(path.join(root, 'src/props_art.js')).href);
const { drawWeaponIcon } = await import(url.pathToFileURL(path.join(root, 'src/hud.js')).href);
const { WEAPONS, RARITY } = await import(url.pathToFileURL(path.join(root, 'src/data_weapons.js')).href);
const { BIOMES } = await import(url.pathToFileURL(path.join(root, 'src/data_biomes.js')).href);

// ---------- 基础工具 ----------
function makeCanvas(w, h) {
  const c = createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}
// 手动最近邻放大（保证像素边缘绝对干净）
function upscale(src, scale) {
  if (scale === 1) return src;
  const sw = src.width, sh = src.height;
  const { c, ctx } = makeCanvas(sw * scale, sh * scale);
  const img = src.getContext('2d').getImageData(0, 0, sw, sh);
  const out = ctx.createImageData(sw * scale, sh * scale);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = (y * sw + x) * 4;
      for (let dy = 0; dy < scale; dy++) {
        const row = (y * scale + dy) * sw * scale;
        for (let dx = 0; dx < scale; dx++) {
          const di = (row + x * scale + dx) * 4;
          out.data[di] = img.data[si];
          out.data[di + 1] = img.data[si + 1];
          out.data[di + 2] = img.data[si + 2];
          out.data[di + 3] = img.data[si + 3];
        }
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}
const files = [];   // { path, canvas, label, category }
function addFile(relPath, canvas, label, category) {
  files.push({ path: relPath, canvas, label, category });
}
function writePNG(canvas, absPath) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, canvas.toBuffer('image/png'));
}

// ---------- 1. 精灵（角色 / 敌人 / Boss / 道具 / 技能） ----------
const SPRITE_LABELS = {
  player_down_0: '夕明 · 朝下（站立）', player_down_1: '夕明 · 朝下（迈步）',
  player_up_0: '夕明 · 朝上（站立）', player_up_1: '夕明 · 朝上（迈步）',
  player_side_0: '夕明 · 侧面（站立，朝右）', player_side_1: '夕明 · 侧面（迈步，朝右）',
  qiqing_down_0: '齐青 · 朝下（站立）', qiqing_down_1: '齐青 · 朝下（迈步）',
  qiqing_up_0: '齐青 · 朝上', qiqing_side_0: '齐青 · 侧面（朝右）',
  guard: '敌人 · 警卫', swat: '敌人 · 特警', drone: '敌人 · 巡逻无人机', turret: '敌人 · 哨戒炮塔',
  dog: '敌人 · 警犬', riot: '敌人 · 镇暴警', biker: '敌人 · 摩托兵', sniper: '敌人 · 狙击手',
  scav: '敌人 · 拾荒者', gang: '敌人 · 流弹兵',
  commander: 'Boss · 卫戍司令官', riotcrawler: 'Boss · 铁幕',
  sandstorm: 'Boss · 沙暴', speaker: 'Boss · 议长', oldcaptain: 'Boss · 旧队长（复用卫戍司令官）',
  chest: '道具 · 宝箱', vend: '道具 · 售货机', heart: '道具 · 生命补给', gear: '道具 · 零件',
  energy: '道具 · 能量电池', umbrella: '道具 · 齐青的长伞', radio: '家具 · 收音机',
  bookshelf: '家具 · 书架', bed: '家具 · 床', bench: '家具 · 长凳',
  skill_bomb: '技能 · 雷管', skill_decoy: '技能 · 诱饵', skill_bandage: '技能 · 绷带包',
};
const SCALES = { '': 1, '@2x': 2, '@4x': 4, '@8x': 8 };
for (const name of Object.keys(ART)) {
  const src = spr(name);
  for (const [suffix, scale] of Object.entries(SCALES)) {
    addFile(`sprites${suffix}/${name}.png`, upscale(src, scale), SPRITE_LABELS[name] || name, 'sprite');
  }
}

// ---------- 2. 地形瓦片（4 个区域 × 全部瓦片） ----------
const TILE_LIST = [
  [T.FLOOR, 'floor', '地面 1'], [T.FLOOR2, 'floor_2', '地面 2'], [T.FLOOR3, 'floor_3', '地面 3'],
  [T.CARPET, 'carpet', '红毯'],
  [T.WALL, 'wall', '墙'], [T.WALL_WINDOW, 'wall_window', '墙 · 窗'], [T.WALL_POSTER, 'wall_poster', '墙 · 海报'],
  [T.WALL_GRAFFITI, 'wall_graffiti', '墙 · 涂鸦'], [T.WALL_CRACK, 'wall_crack', '墙 · 裂缝'],
  [T.WALL_SIGN, 'wall_sign', '墙 · 指示牌'], [T.WALL_NEON, 'wall_neon', '墙 · 霓虹招牌'],
  [T.WALL_WHITEBOARD, 'wall_whiteboard', '墙 · 白板'], [T.WALL_PAINTING, 'wall_painting', '墙 · 挂画'],
  [T.WALL_BANNER, 'wall_banner', '墙 · 横幅'], [T.WALL_ELEVATOR, 'wall_elevator', '墙 · 电梯门'],
  [T.COLUMN, 'column', '柱子'], [T.CRATE, 'crate', '木箱'], [T.DESK, 'desk', '办公桌'],
  [T.CAR, 'car', '报废车'], [T.RAIL, 'rail', '护栏'], [T.PUMP, 'pump', '加油机'],
  [T.RUBBLE, 'rubble', '瓦砾'], [T.HYDRANT, 'hydrant', '消防栓'], [T.SAND, 'sand', '沙地'],
  [T.MEETING, 'meeting_table', '会议长桌'], [T.CABINET, 'cabinet', '档案柜 / 机柜'],
  [T.COOLER, 'cooler', '饮水机 / 空调'], [T.VENDM, 'vending_machine', '室外售货机'],
  [T.TRASH, 'trash_can', '垃圾桶'], [T.BOOTH, 'phone_booth', '电话亭'], [T.MAILBOX, 'mailbox', '邮筒'],
  [T.TIERS, 'tire_stack', '轮胎堆'], [T.DEADTREE, 'dead_tree', '枯树'], [T.SANDBAG, 'sandbags', '沙袋'],
  [T.CAMPFIRE, 'campfire', '篝火'], [T.ROADSIGN, 'road_sign', '路牌'], [T.STALL, 'stall', '路边摊'],
  [T.PLANTT, 'potted_plant', '盆栽'],
  [T.PUDDLE, 'decal_puddle', '地面痕迹 · 水洼'], [T.BLOOD, 'decal_blood', '地面痕迹 · 血迹'],
  [T.SHELLS, 'decal_shells', '地面痕迹 · 弹壳'], [T.CONE, 'decal_traffic_cone', '地面痕迹 · 交通锥'],
  [T.GRATE, 'decal_grate', '地面痕迹 · 格栅'], [T.SCORCH, 'decal_scorch', '地面痕迹 · 焦痕'],
  [T.ROAD, 'road', '公路路面'], [T.RAILS, 'rails', '铁轨'],
  [T.GLASS, 'glass', '玻璃隔断'], [T.LAMP, 'street_lamp', '路灯'], [T.BROKEN_LAMP, 'street_lamp_broken', '路灯 · 被打灭'],
];
const BIOME_LABELS = { indoor: '大建筑室内', street: '室外街道', highway: '城市外公路', council: '议事厅' };
for (const biomeId of Object.keys(BIOMES)) {
  for (const [tileId, name, label] of TILE_LIST) {
    const { c, ctx } = makeCanvas(TS, TS);
    try { exportTileTo(ctx, biomeId, tileId, 0, 0, 0.3); } catch (e) { continue; }
    const prefix = `tiles/${biomeId}`;
    addFile(`${prefix}/${name}.png`, c, `${BIOME_LABELS[biomeId]} · ${label}`, 'tile');
    addFile(`${prefix}@2x/${name}.png`, upscale(c, 2), `${BIOME_LABELS[biomeId]} · ${label}`, 'tile');
    addFile(`${prefix}@4x/${name}.png`, upscale(c, 4), `${BIOME_LABELS[biomeId]} · ${label}`, 'tile');
  }
  // 闸门两种状态
  for (const [locked, name, label] of [[true, 'gate_locked', '闸门 · 落下'], [false, 'gate_open', '闸门 · 敞开']]) {
    const { c, ctx } = makeCanvas(TS, TS);
    exportTileTo(ctx, biomeId, T.GATE, 0, 0, 0.3, { locked });
    addFile(`tiles/${biomeId}/${name}.png`, c, `${BIOME_LABELS[biomeId]} · ${label}`, 'tile');
    addFile(`tiles/${biomeId}@4x/${name}.png`, upscale(c, 4), `${BIOME_LABELS[biomeId]} · ${label}`, 'tile');
  }
}

// ---------- 3. 交互道具 / 载具 / 摄像头 ----------
const PROP_LIST = [
  ['bench', '道具 · 合成台', 44, 40],
  ['board', '道具 · 通缉板', 40, 44],
  ['elevator', '道具 · 电梯', 40, 44],
  ['stairs', '道具 · 楼梯', 44, 40],
  ['manhole', '道具 · 井盖', 32, 28],
  ['overpass', '道具 · 天桥', 40, 40],
  ['portal', '道具 · 传送门', 44, 44],
  ['note', '道具 · 档案纸条', 24, 26],
  ['story', '道具 · 回忆照片', 24, 26],
  ['chest', '道具 · 宝箱（同上，便于分类）', 24, 26],
];
for (const [type, label, w, h] of PROP_LIST) {
  const { c, ctx } = makeCanvas(w, h);
  const prop = { type, x: w / 2, y: h / 2, read: false };
  propsArt.drawPropAt(ctx, prop, { time: 0.3, destLevel: 1, contracted: true });
  addFile(`props/${type}.png`, c, label, 'prop');
  addFile(`props@2x/${type}.png`, upscale(c, 2), label, 'prop');
  addFile(`props@4x/${type}.png`, upscale(c, 4), label, 'prop');
}
{
  // 楼梯另一个方向（上楼）
  const { c, ctx } = makeCanvas(44, 40);
  propsArt.drawPropAt(ctx, { type: 'stairs', x: 22, y: 20 }, { time: 0.3, destLevel: 0 });
  addFile('props/stairs_up.png', c, '道具 · 楼梯（向上）', 'prop');
  addFile('props@4x/stairs_up.png', upscale(c, 4), '道具 · 楼梯（向上）', 'prop');
}
{
  // 摄像头
  const { c, ctx } = makeCanvas(24, 24);
  propsArt.drawCameraBody(ctx, 12, 12, false);
  addFile('props/camera.png', c, '道具 · 监控摄像头', 'prop');
  const { c: c2, ctx: ctx2 } = makeCanvas(24, 24);
  propsArt.drawCameraBody(ctx2, 12, 12, true);
  addFile('props/camera_alert.png', c2, '道具 · 监控摄像头（报警）', 'prop');
}
const VEHICLES = [
  ['car', 28, 16, 1, '载具 · 汽车'], ['truck', 42, 18, 1, '载具 · 卡车'],
  ['train', 26 * 3 + 26, 20, 3, '载具 · 火车（3 节）'], ['train', 26 * 8 + 26, 20, 8, '载具 · 火车（8 节）'],
];
for (const [kind, w, h, cars, label] of VEHICLES) {
  const { c, ctx } = makeCanvas(w, h);
  propsArt.drawVehicleBody(ctx, kind, w, cars);
  const name = kind === 'train' ? `train_${cars}cars` : kind;
  addFile(`vehicles/${name}.png`, c, label, 'vehicle');
  addFile(`vehicles@2x/${name}.png`, upscale(c, 2), label, 'vehicle');
}

// ---------- 4. 武器图标 ----------
for (const [id, def] of Object.entries(WEAPONS)) {
  const { c, ctx } = makeCanvas(24, 16);
  drawWeaponIcon(ctx, def, 12, 8, 1);
  addFile(`weapons/${id}.png`, c, `武器 · ${def.name}（${RARITY[def.rarity].name}）`, 'weapon');
  addFile(`weapons@2x/${id}.png`, upscale(c, 2), `武器 · ${def.name}`, 'weapon');
}

// ---------- 5. 图集 + 清单 ----------
function buildAtlas(entries, scale, maxWidth = 512) {
  const items = entries.map(e => ({ e, w: e.canvas.width * scale, h: e.canvas.height * scale }));
  // 简单网格排列
  const cols = Math.max(1, Math.floor(maxWidth / (Math.max(...items.map(i => i.w)) + 2)));
  const cellW = Math.max(...items.map(i => i.w)) + 2;
  const cellH = Math.max(...items.map(i => i.h)) + 2;
  const rows = Math.ceil(items.length / cols);
  const { c, ctx } = makeCanvas(cols * cellW, rows * cellH);
  const meta = [];
  items.forEach((it, i) => {
    const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    ctx.drawImage(upscale(it.e.canvas, scale), x, y);
    meta.push({ name: it.e.path, x, y, w: it.w, h: it.h, label: it.e.label });
  });
  return { canvas: c, meta, cols, cellW, cellH };
}
const spriteFiles = files.filter(f => f.category === 'sprite' && f.path.startsWith('sprites/'));
for (const [suffix, scale] of [['', 1], ['@2x', 2]]) {
  const { canvas, meta } = buildAtlas(spriteFiles, scale);
  addFile(`atlas/sprites_atlas${suffix}.png`, canvas, '精灵图集', 'atlas');
  fs.mkdirSync(path.join(outRoot, 'atlas'), { recursive: true });
  fs.writeFileSync(path.join(outRoot, `atlas/sprites_atlas${suffix}.json`), JSON.stringify({
    image: `sprites_atlas${suffix}.png`, scale, source: `本目录下 sprites${suffix}/`,
    sprites: meta,
  }, null, 2));
}
for (const biomeId of Object.keys(BIOMES)) {
  const tileFiles = files.filter(f => f.category === 'tile' && f.path.startsWith(`tiles/${biomeId}/`));
  const { canvas, meta } = buildAtlas(tileFiles, 1, 256);
  addFile(`atlas/tiles_${biomeId}.png`, canvas, `${BIOME_LABELS[biomeId]} 瓦片图集`, 'atlas');
  fs.mkdirSync(path.join(outRoot, 'atlas'), { recursive: true });
  fs.writeFileSync(path.join(outRoot, `atlas/tiles_${biomeId}.json`), JSON.stringify({
    image: `tiles_${biomeId}.png`, tileSize: TS, scale: 1, source: `../tiles/${biomeId}/`, tiles: meta,
  }, null, 2));
}

// ---------- 6. 预览拼图（1x 的 4 倍放大，方便直接看） ----------
{
  const entries = spriteFiles;
  const scale = 3, pad = 6, labelH = 10;
  const cellW = Math.max(...entries.map(e => e.canvas.width)) * scale + pad;
  const cellH = Math.max(...entries.map(e => e.canvas.height)) * scale + pad + labelH;
  const cols = Math.ceil(Math.sqrt(entries.length));
  const rows = Math.ceil(entries.length / cols);
  const { c, ctx } = makeCanvas(cols * cellW + pad, rows * cellH + pad);
  ctx.fillStyle = '#14141c';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = '9px sans-serif';
  entries.forEach((e, i) => {
    const cx = pad + (i % cols) * cellW, cy = pad + Math.floor(i / cols) * cellH;
    ctx.drawImage(upscale(e.canvas, scale), cx, cy);
    ctx.fillStyle = '#8a8a98';
    ctx.fillText(path.basename(e.path, '.png'), cx, cy + e.canvas.height * scale + 8);
  });
  addFile('preview/sprites_contact_sheet.png', c, '精灵总览图', 'preview');
}

// ---------- 7. 调色板与源数据 ----------
fs.mkdirSync(path.join(outRoot, 'data'), { recursive: true });
const palettes = {};
for (const [name, def] of Object.entries(ART)) palettes[name] = def.pal;
fs.writeFileSync(path.join(outRoot, 'data/palettes_sprites.json'), JSON.stringify(palettes, null, 2));
const biomePalettes = {};
for (const [id, b] of Object.entries(BIOMES)) {
  biomePalettes[id] = { name: b.name, floor: b.floor, floorAccent: b.floorAccent, grout: b.grout, wall: b.wall, wallTop: b.wallTop, wallLine: b.wallLine, accent: b.accent };
}
fs.writeFileSync(path.join(outRoot, 'data/palettes_biomes.json'), JSON.stringify(biomePalettes, null, 2));
fs.writeFileSync(path.join(outRoot, 'data/sprites_source.json'), JSON.stringify(
  Object.fromEntries(Object.entries(ART).map(([n, d]) => [n, { pal: d.pal, rows: d.rows }])), null, 2));

// ---------- 8. 写出全部文件 ----------
for (const f of files) writePNG(f.canvas, path.join(outRoot, f.path));

// 清单
const manifest = {
  name: '夕明 · 余烬之城 — 美术素材包',
  version: 1,
  generatedAt: new Date().toISOString(),
  tileSize: TS,
  scales: Object.keys(SCALES).map(s => s || '1x'),
  counts: {
    sprites: spriteFiles.length,
    tiles: files.filter(f => f.category === 'tile').length,
    props: files.filter(f => f.category === 'prop').length,
    vehicles: files.filter(f => f.category === 'vehicle').length,
    weapons: files.filter(f => f.category === 'weapon').length,
    total: files.length,
  },
  files: files.map(f => ({ path: f.path, label: f.label, category: f.category, w: f.canvas.width, h: f.canvas.height })),
};
fs.mkdirSync(outRoot, { recursive: true });
fs.writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));

// ---------- 9. 打包 zip ----------
const zipPath = path.join(outRoot, 'ximing-art-assets.zip');
try {
  fs.rmSync(zipPath, { force: true });
  execFileSync('zip', ['-rq', zipPath, '.'], { cwd: outRoot });
  console.log('已打包：', path.relative(root, zipPath));
} catch (e) {
  console.log('未生成 zip（系统缺少 zip 命令？）：', e.message);
}

console.log(`\n完成：${files.length} 个文件 → ${path.relative(root, outRoot)}/`);
console.log(`  精灵 ${manifest.counts.sprites} / 瓦片 ${manifest.counts.tiles} / 道具 ${manifest.counts.props} / 载具 ${manifest.counts.vehicles} / 武器 ${manifest.counts.weapons}`);
