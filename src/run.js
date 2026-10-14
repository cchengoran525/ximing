// 肉鸽局内场景 v2：整层连通大地图 + 摄像机 + 区域制战斗
import { G, setScene, startFade, toast } from './state.js';
import { W, H, TS, T, drawRoom, setDecal, GLOW_TILES, hasLOS, DESTRUCTIBLE } from './world.js';
import { buildFloorMap, rollShopStock, regionAt, buildSideMap } from './roomgen.js';
import { createPlayer, updatePlayer, drawPlayer, hurtPlayer, addBuff, recompute } from './player.js';
import { createEnemy, updateEnemy, drawEnemy, applyAffix } from './enemy.js';
import { BOSSES } from './data_enemies.js';
import { createCompanion, updateCompanion, drawCompanion, hurtCompanion, PARASOL } from './companion.js';
import {
  updateBullets, drawBullets, updateParticles, drawParticles,
  updateZones, drawZones, updateTelegraphs, drawTelegraphs, clearRoomFx, spawnParts,
} from './bullets.js';
import { WEAPONS, RARITY, COMBOS, comboResult } from './data_weapons.js';
import { SKILLS, SKILL_IDS } from './data_skills.js';
import { CONTRACTS, CONTRACT_IDS } from './data_contracts.js';
import { AFFIX_IDS } from './data_affixes.js';
import { BIOMES, CITY_NOTES } from './data_biomes.js';
import { BUFFS, BUFF_IDS } from './data_buffs.js';
import { BOSS_DOWN, QI_UNLOCK_SCENE, ENDINGS, CITY_STAGE_TEXT, QI_SIDE } from './data_dialog.js';
import { drawHUD, drawWeaponIcon } from './hud.js';
import { showDialog, openPanel, shopPanel, buffChoicePanel, companionMenu, pausePanel, combinePanel, contractPanel } from './dialogui.js';
import { sfx, setSong } from './audio.js';
import { Input } from './input.js';
import { addParts, markStat, save, trackKill, trackWeapon, checkAchievements } from './meta.js';
import { drawSpr, spr } from './sprites.js';
import { drawPropAt, drawVehicleBody, drawCameraBody } from './props_art.js';
import { dist, clamp, RNG, text, angleTo } from './utils.js';

const REGION_LABEL = { start: '起点', combat: '街区', elite: '精英', treasure: '储藏室', shop: '售货点', boss: '？？？', vault: '库房', store: '店铺' };
const THEME_LABEL = { meeting: '会议室', breakroom: '茶水间', server: '机房', archive: '档案室', office: '办公区', lobby: '门厅' };

export const runScene = {
  enter({ fresh = true, mode = 'run' } = {}) {
    const seed = (Date.now() & 0xffffff) ^ (Math.random() * 1e9 | 0);
    G.run = {
      mode,
      // 四个区域：三个随机 + 固定的议事厅收尾（支线关只有营房一层）
      biomeOrder: mode === 'qi' ? ['indoor'] : [...new RNG(seed).shuffle(['indoor', 'street', 'highway']), 'council'],
      floorIdx: 0, floor: null, seed,
      parts: 0, partsF: 0, kills: 0, bossKills: 0,
      buffShareUsed: new Set(), over: null, time: 0, cutscene: false, ending: false,
      contract: null, contractOffer: null,
    };
    G.player = createPlayer(0, 0, G.meta);
    G.companion = null;
    if (G.meta.flags.qiMet && G.meta.companion) {
      G.companion = createCompanion(0, 0);
      G.companion.wolfBond = !!G.player.wolfBond;
    }
    markStat('runs');
    loadFloor(0);
  },

  addBuffToPlayer(id) {
    if (BUFFS[id]) { addBuff(G.player, BUFFS[id]); recompute(G.player); }
  },

  swapWeapon() {
    const p = G.player, q = G.companion;
    if (!q) return;
    const mine = p.slots[p.cur];
    p.slots[p.cur] = q.weapon;
    q.weapon = mine || { id: 'parasol', def: PARASOL };
    sfx('pickup');
    toast(`交换成功：你拿着 ${p.slots[p.cur].def.name}`, '#6ac07a');
    G.dialog = null;
  },

  retrieveCarried() {
    const q = G.companion;
    if (!q || !q.carried.length) return;
    const id = q.carried.pop();
    const p = G.player;
    if (!p.slots[0]) p.slots[0] = { id, def: WEAPONS[id] };
    else if (!p.slots[1]) p.slots[1] = { id, def: WEAPONS[id] };
    else {
      G.room.pickups.push({ type: 'weapon', id, x: p.x + 14, y: p.y + 12, t: 0 });
      toast('武器放在了脚边');
    }
    sfx('pickup');
    toast(`拿回了 ${WEAPONS[id].name}`);
  },

  shareBuff() {
    if (G.run.buffShareUsed.has(G.run.floorIdx)) return;
    const pool = new RNG(Date.now() & 0xffff).shuffle(BUFF_IDS).slice(0, 2);
    buffChoicePanel(pool, id => {
      this.addBuffToPlayer(id);
      G.run.buffShareUsed.add(G.run.floorIdx);
      toast(`获得强化：${BUFFS[id].name}`, '#b070e0');
      sfx('heal');
      G.dialog = null;
    });
  },

  finishRun(kind) {
    addParts(G.run.parts);
    G.meta.stats.kills += G.run.kills;
    G.meta.stats.bosses += G.run.bossKills;
    if (kind === 'victory') {
      G.meta.stats.wins++;
      if (G.companion) G.meta.flags.qiWin = true;
    } else if (kind === 'death') {
      G.meta.stats.deaths = (G.meta.stats.deaths || 0) + 1;
    }
    save();
    checkAchievements(true);
    const parts = G.run.parts;
    startFade(0.5, () => {
      G.run = null;
      setScene('hub', hubSceneLazy());
    }, () => {
      if (parts > 0) toast(`带回了 ${parts} 零件`, '#e8c14a');
    });
  },

  // 开发钩子：直接跳层（正常游玩不会触发）
  gotoFloor(idx) { loadFloor(Math.max(0, Math.min(3, idx))); },

  // 合成台：两把武器按配方合成
  combine() {
    const p = G.player;
    const a = p.slots[0] && p.slots[0].id, b = p.slots[1] && p.slots[1].id;
    const out = comboResult(a, b);
    if (!out) { sfx('deny'); return false; }
    p.slots[0] = { id: out, def: WEAPONS[out] };
    p.slots[1] = null;
    p.cur = 0; p.burst = null;
    G.meta.stats.combos = (G.meta.stats.combos || 0) + 1;
    save();
    checkAchievements(true);
    trackWeapon(out);
    spawnParts(p.x, p.y, { n: 18, colors: ['#e8c14a', '#fff'], spd: 95, life: 0.6 });
    sfx('chest');
    G.shake = Math.max(G.shake, 3);
    toast(`合成了「${WEAPONS[out].name}」`, '#e8c14a');
    G.dialog = null;
    return true;
  },

  update(dt) {
    if (!G.run || G.run.over) return;
    if (G.run.cutscene) return;
    if (G.dialog || G.fade) return;
    G.run.time += dt;
    const map = G.room, p = G.player;
    G.hint = null;

    // 坐标防御
    const fix = e => {
      if (!isFinite(e.x) || !isFinite(e.y)) {
        const s = map.regionByKey.get(map.startKey);
        const p0 = spotInRegion(s);
        e.x = p0.x * TS; e.y = p0.y * TS;
      }
    };
    fix(p);
    if (G.companion) fix(G.companion);
    for (const e of map.enemies) fix(e);

    updatePlayer(p, dt);
    if (G.companion) updateCompanion(G.companion, dt);
    for (const e of map.enemies) updateEnemy(e, dt);
    updateBullets(dt);
    updateZones(dt);
    updateTelegraphs(dt);
    updateParticles(dt);
    map.bannerT = Math.max(0, map.bannerT - dt);

    // 图鉴：记录手上的武器（含齐青的）
    if (p.slots[0]) trackWeapon(p.slots[0].id);
    if (p.slots[1]) trackWeapon(p.slots[1].id);
    if (G.companion && G.companion.weapon) trackWeapon(G.companion.weapon.id);

    // 诱饵寿命
    if (G.decoy) {
      G.decoy.t -= dt;
      if (Math.random() < dt * 10) spawnParts(G.decoy.x, G.decoy.y - 8, { n: 1, colors: ['#6fe8e0'], spd: 15, life: 0.3, size: 2 });
      if (G.decoy.t <= 0) {
        spawnParts(G.decoy.x, G.decoy.y, { n: 10, colors: ['#6fe8e0', '#8a8a92'], spd: 70, life: 0.4 });
        sfx('ui_back');
        G.decoy = null;
      }
    }

    // 死亡敌人结算
    for (const e of map.enemies) {
      if (e.dead && !e.processed) {
        e.processed = true;
        G.run.kills++;
        trackKill(e.typeId);
        if (e.elite) G.meta.stats.elites = (G.meta.stats.elites || 0) + 1;
        const mul = p.stats.partsMul || 1;
        const n = Math.round((e.boss ? 45 : e.elite ? 10 : (e.def.parts[0] + Math.random() * (e.def.parts[1] - e.def.parts[0]))) * mul);
        for (let i = 0; i < n; i++) {
          map.pickups.push({ type: 'parts', x: e.x + (Math.random() - 0.5) * 20, y: e.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90, t: 0 });
        }
        if (Math.random() < 0.07) map.pickups.push({ type: 'heart', x: e.x, y: e.y + 8, t: 0 });
        else if (Math.random() < 0.06) map.pickups.push({ type: 'energy', x: e.x, y: e.y + 8, t: 0 });
        if (Math.random() < 0.02) map.pickups.push({ type: 'skill', id: SKILL_IDS[Math.floor(Math.random() * SKILL_IDS.length)], x: e.x, y: e.y + 10, t: 0 });
        if (e.elite) spawnEliteWeapon(map, e);
        // 分裂词缀：死亡时分裂出两只小怪
        if (e.affix === 'split' && !e.mini) {
          for (let i = 0; i < 2; i++) {
            const c = createEnemy(e.typeId, e.x + (i ? 12 : -12), e.y + 6);
            c.hp = c.maxHp = Math.max(4, Math.round(e.maxHp * 0.25));
            c.r = Math.max(4, e.r - 2);
            c.speed *= 1.15;
            c.spawnT = 0.35;
            c.dmgMul = (e.dmgMul || 1) * 0.8;
            c.mini = true;
            c.home = e.home || (G.region && G.region.key);
            map.enemies.push(c);
          }
          spawnParts(e.x, e.y, { n: 8, colors: ['#b070e0', '#fff'], spd: 80, life: 0.4 });
        }
        if (Math.random() < 0.5) setDecal(map, e.x + (Math.random() - 0.5) * 8, e.y + (Math.random() - 0.5) * 8, T.BLOOD);
        if (e.boss) onBossDead(e);
      }
    }
    map.enemies = map.enemies.filter(e => !e.dead);
    checkAchievements();

    // 区域检测与波次
    updateRegion.call(this, map, p, dt);

    // 公路车流
    updateTraffic(map, dt);

    // 破坏结算（掉落 / 警报）
    processBreaks(map);

    // 监控摄像头
    updateCameras(map, dt);

    // 拾取物
    updatePickups(map, p, dt);

    // 摄像机
    updateCamera(map, p, dt);

    // 交互
    handleInteract.call(this, map, p);

    // 菜单
    if (Input.just('Escape')) pausePanel(this);

    // 玩家死亡
    if (p.dead && !G.run.over) onPlayerDeath();
  },

  render(ctx) {
    const map = G.room;
    if (!map) return;
    if (G.run && G.run.ending) { renderEnding(ctx); return; }
    if (G.run && G.run.cutscene) { renderCutscene(ctx); return; }
    const cam = G.cam;
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    drawRoom(ctx, map, G.time, cam);
    drawZones(ctx);
    drawTelegraphs(ctx);
    drawProps(ctx, map);
    drawPickups(ctx, map);
    drawCameras(ctx, map);

    // 诱饵
    if (G.decoy) {
      const d = G.decoy;
      drawSpr(ctx, 'skill_decoy', d.x, d.y, { scale: 2 });
      ctx.strokeStyle = '#6fe8e0';
      ctx.globalAlpha = 0.3 + Math.sin(G.time * 5) * 0.15;
      ctx.beginPath(); ctx.arc(d.x, d.y, 30 + Math.sin(G.time * 3) * 4, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(d.x - 10, d.y - 20, 20, 3);
      ctx.fillStyle = '#6fe8e0';
      ctx.fillRect(d.x - 10, d.y - 20, 20 * clamp(d.t / (d.max || 6), 0, 1), 3);
    }

    const ents = [...map.enemies.filter(e => !e.dead)];
    if (G.player && !G.player.dead) ents.push(G.player);
    if (G.companion) ents.push(G.companion);
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (e === G.player) drawPlayer(ctx);
      else if (e === G.companion) drawCompanion(ctx);
      else drawEnemy(ctx, e);
    }
    drawBullets(ctx);
    drawParticles(ctx);
    // 车流画在实体之上（撞人时压过去）
    drawTraffic(ctx, map);

    // 发光瓦片光晕（篝火 / 霓虹 / 电话亭 / 售货机 / 油泵）
    {
      const tx0 = Math.max(0, Math.floor(cam.x / TS) - 2);
      const ty0 = Math.max(0, Math.floor(cam.y / TS) - 2);
      const tx1 = Math.min(map.w - 1, Math.ceil((cam.x + 512) / TS) + 2);
      const ty1 = Math.min(map.h - 1, Math.ceil((cam.y + 288) / TS) + 2);
      for (let gy = ty0; gy <= ty1; gy++) {
        for (let gx = tx0; gx <= tx1; gx++) {
          const t = map.grid[gy * map.w + gx];
          if (!GLOW_TILES.has(t)) continue;
          const cx = gx * TS + 8, cy = gy * TS + 8;
          const col = t === T.CAMPFIRE ? '242,130,74' : t === T.WALL_NEON ? '110,232,224' : '232,193,85';
          const flick = 0.10 + Math.sin(G.time * 6 + gx * 1.7 + gy) * 0.03;
          const g = ctx.createRadialGradient(cx, cy, 3, cx, cy, 34);
          g.addColorStop(0, `rgba(${col},${flick + 0.06})`);
          g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(cx - 34, cy - 34, 68, 68);
        }
      }
    }
    ctx.restore();

    // 环境氛围
    drawAmbient(ctx, map);

    // 区域小标题
    if (G.region && G.region.type !== 'start') {
      const parts = [];
      if (G.region.level === 1) parts.push('B1');
      const label = REGION_LABEL[G.region.type];
      if (label) parts.push(label);
      if (G.region.theme && THEME_LABEL[G.region.theme] && G.region.level !== 1) parts.push(THEME_LABEL[G.region.theme]);
      if (parts.length) text(ctx, parts.join(' · '), 256, 8, { size: 9, color: '#8a8a98', align: 'center', alpha: 0.8 });
    }

    // B1 楼层：更暗、偏冷
    if (G.region && G.region.level === 1) {
      ctx.fillStyle = 'rgba(10,20,26,0.28)';
      ctx.fillRect(0, 0, 512, 288);
      text(ctx, 'B1', 502, 268, { size: 10, color: '#4a6a78', align: 'right', bold: true });
    }

    // 楼层横幅
    if (map.bannerT > 0) {
      const b = BIOMES[map.biomeId];
      const a = clamp(map.bannerT / 0.6, 0, 1);
      const isLast = G.run.floorIdx === 3 && G.run.mode !== 'qi';
      ctx.globalAlpha = a;
      text(ctx, G.run.mode === 'qi' ? '旧卫戍营房' : `第 ${G.run.floorIdx + 1}/4 层 · ${b.name}`, 256, 44, { size: 16, color: '#e8e2d0', align: 'center', bold: true });
      text(ctx, isLast ? '台阶的尽头' : G.run.mode === 'qi' ? '他说明时间不多' : '找到这层的出口', 256, 64, { size: 10, color: '#9a9aa8', align: 'center' });
      ctx.globalAlpha = 1;
    }

    drawHUD(ctx);
  },
};

// ---------------- 楼层与区域 ----------------
function loadFloor(idx) {
  const run = G.run;
  run.floorIdx = idx;
  run.contract = null;          // 每层重新接契约
  run.contractOffer = null;
  G.decoy = null;
  run.floor = run.mode === 'qi'
    ? buildSideMap(run.seed + 7)
    : buildFloorMap(run.biomeOrder[idx], idx, run.seed + idx * 97);
  const map = run.floor;
  G.room = map;
  G.cam = G.cam || { x: 0, y: 0 };
  clearRoomFx();
  map.enemies = [];
  map.pickups = [];
  map.props = [];

  // 免费区域的道具
  for (const reg of map.regions) {
    if (reg.type === 'treasure') {
      const s = spotInRegion(reg);
      map.props.push({ type: 'chest', x: s.x * TS, y: s.y * TS, region: reg.key });
    }
    if (reg.type === 'shop') {
      if (!reg.stock) reg.stock = rollShopStock(new RNG(reg.seed));
      const s = spotInRegion(reg);
      map.props.push({ type: 'vend', x: s.x * TS, y: s.y * TS - 8, region: reg.key });
    }
    if (reg.type === 'vault') {
      // 库房：散落的零件堆
      for (let i = 0; i < 26; i++) {
        const s = spotInRegion(reg, Math.floor((Math.random() - 0.5) * (reg.w - 6)), Math.floor((Math.random() - 0.5) * (reg.h - 6)));
        map.pickups.push({ type: 'parts', x: s.x * TS, y: s.y * TS, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, t: 0 });
      }
    }
    if (reg.rest) {
      if (!reg.stock) reg.stock = rollShopStock(new RNG(reg.seed));
      const s = spotInRegion(reg, -6, -3);
      map.props.push({ type: 'vend', x: s.x * TS, y: s.y * TS, region: reg.key });
    }
    if (!reg.noteRead && (reg.type === 'combat' || reg.type === 'treasure' || reg.type === 'elite' || reg.isStreet) && Math.random() < 0.3) {
      const stage = Math.min(3, G.meta.stats.wins || 0);
      const extra = (map.biomeId === 'street' || map.biomeId === 'highway')
        ? CITY_NOTES.filter(n => n.stage <= stage).map(n => n.text)
        : [];
      const pool = [...BIOMES[map.biomeId].notes, ...extra].filter(n => !G.meta.notes.includes(n));
      if (pool.length) {
        reg.note = pool[Math.floor(Math.random() * pool.length)];
        const s = spotInRegion(reg, -4, -3);
        map.props.push({ type: 'note', x: s.x * TS, y: s.y * TS, text: reg.note, region: reg.key });
      }
    }
  }

  // 垂直/快捷通道（楼梯 / 电梯 / 天桥 / 下水道）
  for (const pair of (map.travelPairs || [])) {
    const ra = map.regionByKey.get(pair.a), rb = map.regionByKey.get(pair.b);
    if (!ra || !rb) continue;
    const sa = spotInRegion(ra, -3, 2), sb = spotInRegion(rb, 3, 2);
    map.props.push({ type: pair.kind, x: sa.x * TS + 8, y: sa.y * TS + 8, region: ra.key, dest: rb.key, kind: pair.kind });
    map.props.push({ type: pair.kind, x: sb.x * TS + 8, y: sb.y * TS + 8, region: rb.key, dest: ra.key, kind: pair.kind });
  }
  for (const key of (map.elevatorStops || [])) {
    const reg = map.regionByKey.get(key);
    if (!reg) continue;
    const s = spotInRegion(reg, key === map.startKey ? 5 : -5, -3);
    map.props.push({ type: 'elevator', x: s.x * TS + 8, y: s.y * TS + 8, region: key });
  }
  // 摄像头角度初始化
  for (const c of (map.cameras || [])) if (c.ang === undefined) c.ang = c.base;

  const start = map.regionByKey.get(map.startKey);
  start.visited = true;
  G.region = start;
  if (run.mode === 'qi') {
    // 支线：营房里的三处回忆
    const offs = [[-6, -3], [6, -3], [0, 4]];
    QI_SIDE.memories.forEach((txt, i) => {
      const s = spotInRegion(start, offs[i][0], offs[i][1]);
      map.props.push({ type: 'story', x: s.x * TS, y: s.y * TS, text: txt, region: start.key, read: false });
    });
  } else {
    // 起点区设施：合成台 + 通缉板
    const b1 = spotInRegion(start, -6, -3);
    const b2 = spotInRegion(start, 6, -3);
    map.props.push({ type: 'bench', x: b1.x * TS, y: b1.y * TS, region: start.key });
    map.props.push({ type: 'board', x: b2.x * TS, y: b2.y * TS, region: start.key });
  }
  const p = G.player;
  p.x = start.cx * TS; p.y = start.cy * TS;
  if (G.companion) {
    G.companion.x = p.x + 20; G.companion.y = p.y + 8;
    G.companion.downed = false;
    if (G.companion.hp <= 0) G.companion.hp = Math.round(G.companion.maxHp * 0.4);
  }

  // 层间休整
  if (idx > 0) {
    p.hp = Math.min(p.maxHp, p.hp + 2);
    if (p.stats.floorShield) p.shield = 2;
    if (p.wolfBond) p.hp = Math.min(p.maxHp, p.hp + 1);
    toast('你在中转点稍作整顿（+2 生命）', '#6ac07a');
  }

  // 摄像机直接对准
  G.cam.x = clamp(p.x - W / 2, 0, Math.max(0, map.w * TS - W));
  G.cam.y = clamp(p.y - H / 2, 0, Math.max(0, map.h * TS - H));
  map.bannerT = 2.6;
  setSong(BIOMES[map.biomeId].music);
  sfx('door');
}

function updateRegion(map, p, dt) {
  // 内缩 1.5 格判定：玩家真正走进房间内部才触发锁门，避免门口被闸门拍脸
  const reg = regionAt(map, p.x, p.y, TS * 1.5);
  if (reg && reg !== G.region) {
    G.region = reg;
    onEnterRegion(map, reg);
  }
    // 波次推进（只数本房间的怪，避免门外够不到的怪卡住开门）
    const er = map.engagedRegion;
    if (er && !er.cleared) {
      const mine = map.enemies.filter(e => !e.dead && (!e.home || e.home === er.key));
      if (er.waveDelay > 0) {
        er.waveDelay -= dt;
        if (er.waveDelay <= 0) spawnWave(map, er);
      } else if (mine.length === 0) {
        if (er.waveIdx < er.waves.length) er.waveDelay = 0.8;
        else clearRegion(map, er);
      }
    }
}

function onEnterRegion(map, reg) {
  reg.visited = true;
  if (!reg.cleared && !reg.engaged && (reg.type === 'combat' || reg.type === 'elite' || reg.type === 'boss')) {
    reg.engaged = true;
    map.engagedRegion = reg;
    map.lockedRegions.add(reg.key);
    reg.waveIdx = 0;
    reg.waveDelay = 0.55;
    setSong(reg.type === 'boss' ? 'boss' : BIOMES[map.biomeId].music);
    sfx('door');
    // 齐青还在走廊的话，把他拉进房间（贴到玩家身边）
    const q = G.companion;
    if (q && regionAt(map, q.x, q.y, TS * 0.5) !== reg) {
      q.x = G.player.x - 14;
      q.y = G.player.y + 10;
      spawnParts(q.x, q.y, { n: 6, colors: ['#e9e7e0', '#8a8a98'], spd: 40, life: 0.3 });
    }
    if (reg.type === 'boss' && !reg.introDone) {
      reg.introDone = true;
      const bossDef = BOSSES[reg.waves[0][0].id];
      showDialog({ name: bossDef.name, lines: [bossDef.intro] });
    }
  }
}

function clearRegion(map, reg) {
  reg.engaged = false;
  reg.cleared = true;
  map.engagedRegion = null;
  map.lockedRegions.delete(reg.key);
  sfx('door');
  if (reg.type === 'combat' && Math.random() < 0.3) {
    map.pickups.push({ type: Math.random() < 0.5 ? 'heart' : 'energy', x: (reg.x0 + reg.w / 2) * TS, y: (reg.y0 + reg.h / 2) * TS, t: 0 });
  }
  setSong(BIOMES[map.biomeId].music);
}

function spawnWave(map, reg) {
  const wave = reg.waves[reg.waveIdx];
  reg.waveIdx++;
  const p = G.player;
  const scale = 1 + 0.18 * G.run.floorIdx;
  const ct = G.run.contract ? G.run.contract.id : null;
  const list = wave.slice();
  // 契约：追捕令 → 敌人数量 +25%
  if (ct === 'hunt') list.push({ id: wave[Math.floor(Math.random() * wave.length)].id, elite: false });
  // 小房间凑不出 130px：按房间尺寸缩放最小出生距离，并保留"最远处兜底"
  const minDist = Math.min(130, Math.min(reg.w, reg.h) * TS * 0.42);
  const place = (w) => {
    let best = null, bestD = -1;
    for (let i = 0; i < 60; i++) {
      const x = (reg.x0 + 2 + Math.random() * (reg.w - 4)) * TS;
      const y = (reg.y0 + 2 + Math.random() * (reg.h - 4)) * TS;
      const t = map.grid[Math.floor(y / TS) * map.w + Math.floor(x / TS)];
      if (t < 1 || t > 3) continue;
      const d = dist(x, y, p.x, p.y);
      if (d > bestD) { bestD = d; best = { x, y }; }
      if (d < minDist) continue;
      best = { x, y };
      break;
    }
    if (!best) {
      const s = spotInRegion(reg, 0, 0);
      best = { x: s.x * TS, y: s.y * TS };
    }
    const e = createEnemy(w.id, best.x, best.y, w.elite);
    e.hp = e.maxHp = Math.round(e.hp * scale);
    e.home = reg.key;                     // 归属房间：只在房内活动，也不会拖住清房
    if (ct === 'haste') e.cdMul = (e.cdMul || 1) * 0.8;   // 契约：急件
    if (w.elite) applyAffix(e, AFFIX_IDS[Math.floor(Math.random() * AFFIX_IDS.length)]); // 精英随机词缀
    map.enemies.push(e);
  };
  for (const w of list) place(w);
  sfx('alarm');
}

function onBossDead(e) {
  const map = G.room, run = G.run;
  const reg = map.engagedRegion;
  map.bossDead = true;
  if (reg) reg.bossDead = true;
  run.bossKills++;
  map.props.push({ type: 'portal', x: (reg ? reg.cx : map.w / 2) * TS, y: (reg ? reg.cy : map.h / 2) * TS });
  setSong(BIOMES[map.biomeId].music);
  sfx('boom');
  G.shake = 10;
  // 公路层通关计数（达到 2 次时触发齐青解锁剧情）
  if (map.biomeId === 'highway' && run.mode !== 'qi') {
    G.meta.flags.highwayClears = (G.meta.flags.highwayClears || 0) + 1;
    save();
  }
  showDialog({
    name: e.def.name,
    lines: [BOSS_DOWN[e.def.id] || '……'],
    onDone: () => {
      // 支线关：旧队长倒下 → 齐青的收尾
      if (run.mode === 'qi') {
        showDialog({
          name: '齐青', portrait: 'qiqing_down_0',
          lines: QI_SIDE.ending,
          onDone: () => {
            G.meta.flags.qiSideDone = true;
            G.meta.flags.qiBond = true;          // 他的伞更强了
            G.meta.flags.qiStage = Math.max(G.meta.flags.qiStage || 0, 3);
            save();
            toast('齐青的伞修好了。他好像放下了什么。', '#6ac07a');
            openPanel({
              title: '旧卫戍营房 · 走完了',
              hint: `「伞我拿着——回去的路上下雨。」\n（齐青的防暴伞变得更顺手了：伤害与射速 +25%）\n本局收集 ${run.parts} 零件`,
              items: [{ label: '回到小屋', fn: () => runScene.finishRun('side') }],
            });
          },
        });
        return;
      }
      if (map.biomeId === 'highway' && (G.meta.flags.highwayClears || 0) >= 2 && !G.meta.flags.qiMet) {
        startQiCutscene();
      }
    },
  });
}

// ---- 齐青解锁过场：雨天站台（第二次清完公路层触发） ----
function startQiCutscene() {
  const run = G.run;
  run.cutscene = true;
  setSong('rest');
  sfx('thunder');
  showDialog({
    name: '', portrait: null,
    lines: QI_UNLOCK_SCENE.lines,
    onDone: () => {
      run.cutscene = false;
      G.meta.flags.qiMet = true;
      G.meta.flags.qiReady = true;
      save();
      const map = G.room;
      setSong(map && map.biomeId ? BIOMES[map.biomeId].music : 'hub');
      toast('「齐青」。你记住了这个名字。回小屋时，他会在窗边。', '#6ac07a');
    },
  });
}

function drawOpenUmbrella(ctx, x, y) {  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.14);
  // 伞面
  ctx.fillStyle = '#8c2f3a';
  ctx.beginPath();
  ctx.arc(0, 0, 26, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  // 伞骨
  ctx.strokeStyle = '#5e1f28';
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    const a = Math.PI + (Math.PI / 6) * i;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.stroke();
  }
  // 伞沿
  ctx.strokeStyle = '#c8a04a';
  ctx.beginPath(); ctx.arc(0, 0, 26, Math.PI, Math.PI * 2); ctx.stroke();
  // 顶针与伞杆
  ctx.fillStyle = '#c8a04a'; ctx.fillRect(-1, -4, 2, 5);
  ctx.fillStyle = '#3a3f46'; ctx.fillRect(-1, 0, 2, 44);
  ctx.restore();
}

// ---- 公路车流：预警 → 出车 → 撞击敌我 ----
function updateTraffic(map, dt) {
  if (!map || !map.lanes || !map.lanes.length) return;
  const p = G.player, q = G.companion;
  for (const lane of map.lanes) {
    lane.next -= dt;
    if (lane.next <= 0) {
      lane.next = lane.gap * (0.75 + Math.random() * 0.7);
      map.traffic.push({ warn: lane.kind === 'train' ? 2.2 : 0.95, lane, kind: lane.kind });
    }
  }
  for (let i = map.traffic.length - 1; i >= 0; i--) {
    const v = map.traffic[i];
    const ln = v.lane;
    if (v.warn > 0) {
      v.warn -= dt;
      if (v.warn <= 0) {
        if (ln.axis === 'h') {
          const cars = ln.kind === 'train' ? (ln.cars || 44) : 0;
          const seg = 26;
          const len = ln.kind === 'train' ? cars * seg + 26 : ln.kind === 'truck' ? 42 : 28;
          const h = ln.kind === 'train' ? 20 : 15;
          v.w = len; v.h = h; v.cars = cars;
          v.vx = ln.dir * (ln.kind === 'train' ? 400 : ln.kind === 'truck' ? 235 : 300);
          v.vy = 0;
          // 起点完全在画面外：长编组要再退后它自身的长度
          v.x = ln.dir > 0
            ? ln.x0 * TS - len / 2 - 24
            : ln.x1 * TS + len / 2 + 24;
          v.y = ln.y * TS + 8;
        } else {
          v.x = ln.x * TS + 8;
          v.y = (ln.dir > 0 ? ln.y0 - 4 : ln.y1 + 4) * TS;
          v.vx = 0;
          v.vy = ln.dir * 300;
          v.w = 15; v.h = 28;
        }
        sfx(ln.kind === 'train' ? 'alarm' : 'charge', 0.75);
        G.shake = Math.max(G.shake, ln.kind === 'train' ? 3.5 : 1.5);
      }
      continue;
    }
    v.x += v.vx * dt; v.y += v.vy * dt;
    if (Math.random() < dt * 22) spawnParts(v.x, v.y + 9, { n: 1, colors: ['#8a8a92', '#c9c9c9'], spd: 24, life: 0.5, size: 2 });
    const hw = v.w / 2, hh = v.h / 2;
    const hit = (ex, ey, er) => Math.abs(ex - v.x) < hw + er && Math.abs(ey - v.y) < hh + er;
    if (p && !p.dead && hit(p.x, p.y, p.r)) {
      hurtPlayer(p, ln.kind === 'train' ? 8 : 6);
      const push = 26;
      p.x += (v.vx ? Math.sign(v.vx) * push : 0);
      p.y += (v.vy ? Math.sign(v.vy) * push : 0);
      if (p.iT <= 0.5) p.iT = 0.6;
    }
    if (q && !q.downed && hit(q.x, q.y, q.r)) hurtCompanion(q, ln.kind === 'train' ? 10 : 7);
    for (const e of map.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (hit(e.x, e.y, e.r)) {
        e.hurt(ln.kind === 'train' ? 70 : 34, { dir: Math.atan2(v.vy, v.vx), knock: 130 });
        spawnParts(e.x, e.y, { n: 8, colors: ['#8c3038', '#c9c9c9'], spd: 110, life: 0.4, size: 2 });
      }
    }
    // 出界/超程移除（长编组要等整列通过）
    const half = (v.w || 30) / 2;
    if (ln.axis === 'h') {
      if ((ln.dir > 0 && v.x - half > (ln.x1 + 2) * TS) || (ln.dir < 0 && v.x + half < (ln.x0 - 2) * TS)) map.traffic.splice(i, 1);
    } else {
      if ((ln.dir > 0 && v.y - half > (ln.y1 + 4) * TS) || (ln.dir < 0 && v.y + half < (ln.y0 - 4) * TS)) map.traffic.splice(i, 1);
    }
  }
}

function drawTraffic(ctx, map) {
  if (!map || !map.lanes) return;
  for (const v of map.traffic) {
    const ln = v.lane;
    if (v.warn > 0) {
      const axisH = ln.axis === 'h';
      // 火车：沿整条铁轨亮起道口信号（视野内每 96px 一个）
      if (ln.kind === 'train' && axisH) {
        const blink = Math.sin(G.time * 14) > 0;
        const from = Math.max(0, Math.floor((G.cam.x - 32) / 96));
        const to = Math.ceil((G.cam.x + 544) / 96);
        for (let i = from; i <= to; i++) {
          const sx = i * 96;
          if (sx < ln.x0 * TS || sx > ln.x1 * TS) continue;
          const sy = ln.y * TS;
          // 信号柱
          ctx.fillStyle = '#2a2f38';
          ctx.fillRect(sx, sy - 22, 3, 20);
          ctx.fillRect(sx - 4, sy - 26, 11, 5);
          ctx.fillStyle = blink ? '#e05540' : '#4a1f1a';
          ctx.fillRect(sx - 2, sy - 25, 3, 3);
          ctx.fillStyle = blink ? '#4a1f1a' : '#e05540';
          ctx.fillRect(sx + 2, sy - 25, 3, 3);
        }
      }
      const px = axisH ? (ln.dir > 0 ? ln.x0 + 1 : ln.x1 - 1) * TS : ln.x * TS + 8;
      const py = axisH ? ln.y * TS + 8 : (ln.dir > 0 ? ln.y0 + 1 : ln.y1 - 1) * TS;
      if (px > G.cam.x - 40 && px < G.cam.x + 552 && py > G.cam.y - 40 && py < G.cam.y + 328) {
        const blink = Math.sin(G.time * 18) > 0;
        ctx.globalAlpha = blink ? 0.95 : 0.3;
        ctx.fillStyle = ln.kind === 'train' ? '#e05540' : '#e8c14a';
        ctx.beginPath();
        if (axisH) {
          const d = ln.dir > 0 ? 1 : -1;
          ctx.moveTo(px + d * 8, py); ctx.lineTo(px - d * 4, py - 6); ctx.lineTo(px - d * 4, py + 6);
        } else {
          const d = ln.dir > 0 ? 1 : -1;
          ctx.moveTo(px, py + d * 8); ctx.lineTo(px - 6, py - d * 4); ctx.lineTo(px + 6, py - d * 4);
        }
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (ln.kind === 'train') text(ctx, '铁轨 · 注意', px, py - 16, { size: 8, color: '#e05540', align: 'center', bold: true });
    } else {
      drawVehicle(ctx, v, ln);
    }
  }
}

function drawVehicle(ctx, v, ln) {
  const axisH = ln.axis === 'h';
  const dir = axisH ? Math.sign(v.vx || 1) : Math.sign(v.vy || 1);
  ctx.save();
  ctx.translate(v.x, v.y);
  if (axisH) { if (dir < 0) ctx.scale(-1, 1); }
  else ctx.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  // 前照灯光
  const g = ctx.createLinearGradient(v.w / 2, 0, v.w / 2 + 56, 0);
  g.addColorStop(0, 'rgba(255,240,190,0.22)');
  g.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(v.w / 2, -9, 56, 18);
  if (v.kind === 'train' || v.kind === 'truck' || v.kind === 'car') {
    drawVehicleBody(ctx, v.kind, v.w, v.cars || 4);
  } else {
    drawVehicleBody(ctx, 'car', v.w, 1);
  }
  ctx.restore();
}

// ---- 破坏结算：掉落物 / 售货机警报 ----
function processBreaks(map) {
  if (!map.breakQueue || !map.breakQueue.length) return;
  for (const br of map.breakQueue) {
    const tile = br.tile;
    if (tile === 'camera') {
      for (let i = 0; i < 5; i++) map.pickups.push({ type: 'parts', x: br.x, y: br.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, t: 0 });
      toast('摄像头被打下来了', '#6fe8e0');
      continue;
    }
    const def = DESTRUCTIBLE[tile];
    if (!def) continue;
    if (def.parts) {
      const n = def.parts[0] + Math.floor(Math.random() * (def.parts[1] - def.parts[0] + 1));
      for (let i = 0; i < n; i++) map.pickups.push({ type: 'parts', x: br.x, y: br.y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, t: 0 });
    }
    if (def.note && Math.random() < def.note) {
      const pool = BIOMES[map.biomeId].notes.filter(n => !G.meta.notes.includes(n));
      if (pool.length) map.props.push({ type: 'note', x: br.x, y: br.y, text: pool[Math.floor(Math.random() * pool.length)], region: null });
    }
    if (def.loot) {
      // 砸开的售货机：掉一件随机东西 + 触发警报
      const r = Math.random();
      const wpool = G.meta.weapons.filter(id => WEAPONS[id] && WEAPONS[id].price > 0);
      if (r < 0.45 && wpool.length) {
        map.pickups.push({ type: 'weapon', id: wpool[Math.floor(Math.random() * wpool.length)], x: br.x, y: br.y + 8, t: 0 });
      } else if (r < 0.7) {
        map.pickups.push({ type: 'skill', id: SKILL_IDS[Math.floor(Math.random() * SKILL_IDS.length)], x: br.x, y: br.y + 8, t: 0 });
      } else {
        map.pickups.push({ type: 'heart', x: br.x, y: br.y + 8, t: 0 });
      }
      sfx('chest');
    }
    if (def.alarm) alarmAt(map, br.x, br.y, 3);
    if (def.splash) {
      spawnParts(br.x, br.y, { n: 14, colors: ['#6fe8e0', '#a8e8f0'], spd: 110, life: 0.5, size: 2, grav: 40 });
    }
    if (def.junk) {
      map.pickups.push({ type: 'parts', x: br.x, y: br.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, t: 0 });
    }
  }
  map.breakQueue.length = 0;
}

// 警报：在附近刷出增援（归入所在房间）
function alarmAt(map, x, y, n = 3) {
  sfx('alarm');
  toast('警报！附近的人被惊动了', '#e05540');
  const biome = BIOMES[map.biomeId];
  const srcReg = regionAt(map, x, y, 0);
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const ex = x + (Math.random() - 0.5) * 220;
      const ey = y + (Math.random() - 0.5) * 220;
      const tx = Math.floor(ex / TS), ty = Math.floor(ey / TS);
      if (tx < 1 || ty < 1 || tx >= map.w - 1 || ty >= map.h - 1) continue;
      const t = map.grid[ty * map.w + tx];
      if (t < 1 || t > 3) continue;
      const e = createEnemy(rngPick(biome.pool), ex, ey);
      e.hp = e.maxHp = Math.round(e.hp * (1 + 0.18 * G.run.floorIdx));
      const rr = regionAt(map, ex, ey, 0);
      e.home = (rr || srcReg) ? (rr || srcReg).key : null;
      map.enemies.push(e);
      spawnParts(ex, ey, { n: 6, colors: ['#e05540', '#3a3a44'], spd: 70, life: 0.4 });
      break;
    }
  }
}
function rngPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---- 监控摄像头 ----
function updateCameras(map, dt) {
  if (!map.cameras || !map.cameras.length) return;
  const p = G.player;
  for (const c of map.cameras) {
    if (c.dead) continue;
    c.t += dt;
    c.flash = Math.max(0, c.flash - dt);
    c.ang = c.base + Math.sin(c.t * c.sweep) * 1.15;
    if (c.alertT > 0) {
      c.alertT -= dt;
      if (c.alertT <= 0) c.dead = true;    // 报警后烧掉（一次性）
      continue;
    }
    if (!p || p.dead) continue;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d > c.range) continue;
    let da = Math.abs(((angleTo(c.x, c.y, p.x, p.y) - c.ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
    da = Math.min(da, Math.PI * 2 - da);
    if (da > 0.5) continue;
    if (!hasLOS(map, c.x, c.y, p.x, p.y)) continue;
    c.alertT = 2.2;
    c.flash = 0.6;
    toast('被监控拍到了！', '#e05540');
    alarmAt(map, c.x, c.y, 3);
  }
}

function drawCameras(ctx, map) {
  if (!map.cameras || !map.cameras.length) return;
  for (const c of map.cameras) {
    if (c.dead) continue;
    const ang = c.ang !== undefined ? c.ang : c.base;
    const alert = c.alertT > 0;
    // 视野扇形
    ctx.globalAlpha = alert ? 0.34 + Math.sin(G.time * 20) * 0.16 : 0.16;
    ctx.fillStyle = alert ? '#e05540' : '#e8c14a';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, c.range, ang - 0.5, ang + 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // 机身
    drawCameraBody(ctx, c.x, c.y, alert);
    if (c.flash > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(c.x - 3, c.y - 6, 6, 3); }
    // 扫描线
    ctx.strokeStyle = alert ? '#e05540' : '#e8c14a';
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(ang) * c.range * 0.7, c.y + Math.sin(ang) * c.range * 0.7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ---- 垂直/快捷通道 ----
function doTravel(kind, destKey, label) {
  const map = G.room;
  const reg = map.regionByKey.get(destKey);
  if (!reg) return;
  sfx(kind === 'elevator' ? 'teleport' : 'door');
  startFade(0.36, () => {
    const s = spotInRegion(reg, 0, 2);
    const p = G.player;
    p.x = s.x * TS + 8; p.y = s.y * TS + 8;
    p.iT = Math.max(p.iT, 1.0);
    if (G.companion) { G.companion.x = p.x + 18; G.companion.y = p.y + 12; G.companion.iT = 1; }
    reg.visited = true;
    G.region = reg;
    onEnterRegion(map, reg);
    toast(label, '#6fe8e0');
  });
}

function elevatorPanel() {
  const map = G.room;
  const items = (map.elevatorStops || []).map(key => {
    const reg = map.regionByKey.get(key);
    if (!reg) return null;
    const name = (reg.level === 1 ? 'B1 · ' : 'F1 · ') + (THEME_LABEL[reg.theme] || REGION_LABEL[reg.type] || reg.type);
    return {
      label: name,
      sub: REGION_LABEL[reg.type] || '',
      fn: () => { G.dialog = null; doTravel('elevator', key, '电梯：' + name); },
    };
  }).filter(Boolean);
  items.push({ label: '留在本层', fn: () => {} });
  openPanel({ title: '电梯 · 选择楼层', items, hint: '按一下，灯亮，然后门开了。', w: 330 });
}


function drawAmbient(ctx, map) {
  const amb = (BIOMES[map.biomeId] || {}).ambient;
  if (amb === 'street') {
    ctx.fillStyle = 'rgba(40,52,84,0.12)';
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = 'rgba(150,180,220,0.15)';
    for (let i = 0; i < 26; i++) {
      const rx = (i * 89 + G.time * 135) % 512, ry = (i * 61 + G.time * 300) % 288;
      ctx.fillRect(rx, ry, 1, 5);
    }
  } else if (amb === 'highway') {
    const g = ctx.createLinearGradient(0, 0, 0, 288);
    g.addColorStop(0, 'rgba(210,140,70,0.11)');
    g.addColorStop(0.55, 'rgba(150,80,40,0.05)');
    g.addColorStop(1, 'rgba(60,30,20,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 288);
  } else if (amb === 'council') {
    const g = ctx.createRadialGradient(256, 140, 60, 256, 140, 330);
    g.addColorStop(0, 'rgba(200,220,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,12,0.32)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 288);
  } else {
    const g = ctx.createRadialGradient(256, 140, 90, 256, 140, 330);
    g.addColorStop(0, 'rgba(232,193,85,0.04)');
    g.addColorStop(1, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 288);
  }
}

// ---- 结局画面（黎明 + 背影） ----
function renderEnding(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 288);
  g.addColorStop(0, '#141a2e');
  g.addColorStop(0.45, '#3d3a52');
  g.addColorStop(0.75, '#8a5a4a');
  g.addColorStop(1, '#c88a5a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 288);
  // 城市剪影
  ctx.fillStyle = '#12141f';
  const sky = [[0, 140, 70, 70], [80, 112, 50, 98], [140, 152, 80, 58], [230, 122, 60, 88], [300, 142, 70, 68], [380, 112, 50, 98], [440, 148, 60, 62]];
  for (const [bx, by, bw, bh] of sky) ctx.fillRect(bx, by, bw, bh);
  // 亮窗：随通关次数变多（城市在醒来）
  const stage = Math.min(3, G.meta.stats.wins || 0);
  ctx.fillStyle = `rgba(232,193,85,${0.10 + stage * 0.10})`;
  for (let i = 0; i < 80; i++) {
    const wx = (i * 89) % 500 + 6, wy = 118 + ((i * 53) % 84);
    if (wy < 206) ctx.fillRect(wx, wy, 2, 2);
  }
  // 地面与反光
  ctx.fillStyle = '#2a2b33';
  ctx.fillRect(0, 206, 512, 82);
  ctx.fillStyle = 'rgba(210,150,100,0.3)';
  ctx.fillRect(0, 206, 512, 2);
  ctx.fillStyle = 'rgba(200,150,110,0.10)';
  for (const [px, py, pw] of [[90, 250, 60], [280, 264, 80], [420, 246, 50]]) {
    ctx.beginPath(); ctx.ellipse(px, py, pw, 5, 0, 0, 7); ctx.fill();
  }
  // 背影
  drawSpr(ctx, 'player_up_0', 236, 176, { scale: 2 });
  if (G.companion) {
    drawSpr(ctx, 'qiqing_up_0', 272, 174, { scale: 2 });
    ctx.save();
    ctx.translate(272, 146);
    ctx.rotate(0.14);
    drawOpenUmbrella(ctx, 0, 0);
    ctx.restore();
  }
  // 尾声的雨
  ctx.fillStyle = 'rgba(170,200,235,0.20)';
  for (let i = 0; i < 22; i++) {
    const rx = (i * 97 + G.time * 120) % 512, ry = (i * 41 + G.time * 210) % 288;
    ctx.fillRect(rx, ry, 1, 4);
  }
  ctx.fillStyle = 'rgba(255,215,165,0.05)';
  ctx.fillRect(0, 0, 512, 130);
}

// ---- 齐青解锁过场：雨天站台 ----
function renderCutscene(ctx) {
  // 夜空
  const g = ctx.createLinearGradient(0, 0, 0, 288);
  g.addColorStop(0, '#0d1220');
  g.addColorStop(0.65, '#161c2a');
  g.addColorStop(1, '#1e232e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 288);
  // 远处城市剪影
  ctx.fillStyle = '#0b0e16';
  const sky = [[0, 150, 70, 60], [80, 122, 50, 88], [140, 162, 80, 48], [230, 132, 60, 78], [300, 152, 70, 58], [380, 122, 50, 88], [440, 158, 60, 52]];
  for (const [bx, by, bw, bh] of sky) ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = 'rgba(232,193,85,0.16)';
  for (let i = 0; i < 60; i++) {
    const wx = (i * 97) % 500 + 6, wy = 128 + ((i * 53) % 80);
    if (wy < 204) ctx.fillRect(wx, wy, 2, 2);
  }
  // 地面（公路）
  ctx.fillStyle = '#232830';
  ctx.fillRect(0, 204, 512, 84);
  ctx.fillStyle = '#2e3540';
  ctx.fillRect(0, 204, 512, 2);
  ctx.fillStyle = 'rgba(216,208,192,0.10)';
  for (let i = 0; i < 6; i++) ctx.fillRect(30 + i * 84, 246, 22, 2);
  // 积水
  ctx.fillStyle = 'rgba(150,180,220,0.08)';
  for (const [px, py, pw] of [[90, 252, 56], [250, 268, 78], [396, 250, 46]]) {
    ctx.beginPath(); ctx.ellipse(px, py, pw, 5, 0, 0, 7); ctx.fill();
  }
  // 雨
  ctx.fillStyle = 'rgba(150,180,220,0.20)';
  for (let i = 0; i < 60; i++) {
    const rx = (i * 89 + G.time * 150) % 512, ry = (i * 61 + G.time * 260) % 288;
    ctx.fillRect(rx, ry, 1, 4);
  }
  ctx.fillStyle = 'rgba(170,200,235,0.42)';
  for (let i = 0; i < 46; i++) {
    const rx = (i * 67 + G.time * 240) % 512, ry = (i * 41 + G.time * 420) % 288;
    ctx.fillRect(rx, ry, 1, 7);
  }
  // 路灯
  const lx = 150;
  ctx.fillStyle = '#2e333a';
  ctx.fillRect(lx, 96, 3, 108);
  ctx.fillRect(lx - 16, 92, 20, 4);
  ctx.fillStyle = '#e8c14a';
  ctx.fillRect(lx - 3, 94, 4, 3);
  const lg = ctx.createRadialGradient(lx - 2, 100, 4, lx - 2, 100, 120);
  lg.addColorStop(0, 'rgba(232,193,85,0.26)');
  lg.addColorStop(1, 'rgba(232,193,85,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(lx - 122, 0, 244, 220);
  // 站牌
  ctx.fillStyle = '#3a4148';
  ctx.fillRect(58, 140, 3, 64);
  ctx.fillStyle = '#2e3540';
  ctx.fillRect(44, 132, 32, 11);
  ctx.fillStyle = '#d8d0c0';
  ctx.fillRect(47, 135, 16, 2);
  ctx.fillRect(47, 139, 10, 2);

  // 长椅
  const bx = 268, by = 196;
  ctx.fillStyle = '#2e2620';
  ctx.fillRect(bx + 3, by + 5, 4, 12);
  ctx.fillRect(bx + 59, by + 5, 4, 12);
  ctx.fillStyle = '#4a3c28';
  ctx.fillRect(bx, by, 68, 5);
  ctx.fillRect(bx + 2, by + 14, 64, 3);

  // 夕明：坐在长椅上（只画上半身）
  const pSpr = spr('player_side_0');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pSpr, 0, 0, 16, 12, bx + 12, by - 22, 32, 24);

  // 齐青：立在长椅右侧，白帽子 + 撑开的伞（朝夕明倾斜）
  drawSpr(ctx, 'qiqing_down_0', bx + 84, by - 14, { scale: 2 });
  drawOpenUmbrella(ctx, bx + 42, by - 62);
}


function onPlayerDeath() {
  const run = G.run;
  run.over = 'death';
  setSong('rest');
  openPanel({
    title: '你倒在了' + BIOMES[G.run.floor.biomeId].name,
    hint: `本局击杀 ${run.kills} · 击败 Boss ${run.bossKills} · 收集 ${run.parts} 零件\n零件已带回小屋。城市明天照常醒来。`,
    items: [{ label: '回到小屋', fn: () => runScene.finishRun('death') }],
  });
}

// 在区域内找一个可行走的格子（形状房间用）
function spotInRegion(reg, ox = 0, oy = 0) {
  const map = G.room;
  const cx = reg.x0 + (reg.w >> 1) + ox;
  const cy = reg.y0 + (reg.h >> 1) + oy;
  const ok = (x, y) => {
    if (x < 1 || y < 1 || x >= map.w - 1 || y >= map.h - 1) return false;
    const t = map.grid[y * map.w + x];
    return t === T.FLOOR || t === T.FLOOR2 || t === T.FLOOR3;
  };
  if (ok(cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (ok(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
    }
  }
  return { x: cx, y: cy };
}

// ---------------- 摄像机 ----------------
function updateCamera(map, p, dt) {
  const tx = clamp(p.x - W / 2, 0, Math.max(0, map.w * TS - W));
  const ty = clamp(p.y - H / 2, 0, Math.max(0, map.h * TS - H));
  const k = Math.min(1, dt * 8);
  G.cam.x += (tx - G.cam.x) * k;
  G.cam.y += (ty - G.cam.y) * k;
  G.mworld.x = Input.mx + G.cam.x;
  G.mworld.y = Input.my + G.cam.y;
}

// ---------------- 拾取与交互 ----------------
function updatePickups(map, p, dt) {
  for (let i = map.pickups.length - 1; i >= 0; i--) {
    const it = map.pickups[i];
    it.t = (it.t || 0) + dt;
    if (it.type === 'parts') {
      it.x += (it.vx || 0) * dt; it.y += (it.vy || 0) * dt;
      it.vx *= 0.9; it.vy *= 0.9;
      const d = dist(it.x, it.y, p.x, p.y);
      if (d < 46) {
        const a = Math.atan2(p.y - it.y, p.x - it.x);
        it.x += Math.cos(a) * 180 * dt; it.y += Math.sin(a) * 180 * dt;
      }
      if (d < 12) {
        const ctMul = G.run.contract ? G.run.contract.reward : 1;
        G.run.partsF += (p.stats.partsMul || 1) * ctMul;
        G.run.parts = Math.floor(G.run.partsF);
        if (Math.random() < 0.4) sfx('parts');
        map.pickups.splice(i, 1);
      }
      continue;
    }
    if (it.type === 'heart' && dist(it.x, it.y, p.x, p.y) < 14) {
      // 契约：封锁令 → 无法靠拾取回血
      if (G.run.contract && G.run.contract.id === 'lockdown') continue;
      if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 2); sfx('heal'); map.pickups.splice(i, 1); }
      continue;
    }
    if (it.type === 'energy' && dist(it.x, it.y, p.x, p.y) < 14) {
      p.en = Math.min(p.maxEn, p.en + 30); sfx('pickup'); map.pickups.splice(i, 1);
      continue;
    }
    if (it.type === 'skill' && dist(it.x, it.y, p.x, p.y) < 16) {
      const def = SKILLS[it.id];
      if (!def) { map.pickups.splice(i, 1); continue; }
      if (!p.skill || p.skill.id !== it.id) {
        p.skill = { id: it.id, def };
        p.skillCd = 0;
        toast(`装备技能：${def.name}（F 释放）`, def.color);
      } else {
        G.run.partsF += 15;
        toast('重复的技能拆成了 15 零件', '#e8c14a');
      }
      sfx('pickup');
      spawnParts(it.x, it.y, { n: 8, colors: [def.color, '#fff'], spd: 60, life: 0.4 });
      map.pickups.splice(i, 1);
      continue;
    }
    if (it.type === 'weapon') {
      if (dist(it.x, it.y, p.x, p.y) < 16 && (!p.slots[0] || !p.slots[1])) {
        const slot = !p.slots[0] ? 0 : 1;
        p.slots[slot] = { id: it.id, def: WEAPONS[it.id] };
        sfx('pickup');
        toast(`拾取了 ${WEAPONS[it.id].name}`);
        map.pickups.splice(i, 1);
        continue;
      }
      const q = G.companion;
      if (q && !q.downed && it.t > 4 && q.carried.length < 3 && dist(it.x, it.y, q.x, q.y) < 90) {
        q.carried.push(it.id);
        toast(`齐青帮你收起了「${WEAPONS[it.id].name}」`, '#6ac07a');
        sfx('pickup');
        map.pickups.splice(i, 1);
        continue;
      }
    }
  }
}

function handleInteract(map, p) {
  let best = null, bd = 28;
  for (const prop of map.props) {
    const d = dist(prop.x, prop.y, p.x, p.y);
    if (d < bd) { bd = d; best = { kind: 'prop', prop }; }
  }
  const q = G.companion;
  if (q && q.downed && dist(q.x, q.y, p.x, p.y) < 26) best = { kind: 'revive' };
  else if (q && !q.downed && dist(q.x, q.y, p.x, p.y) < 24 && (!best || bd > 18)) best = { kind: 'qi' };
  if (!best) {
    for (const it of map.pickups) {
      if (it.type === 'weapon' && dist(it.x, it.y, p.x, p.y) < 20 && p.slots[0] && p.slots[1]) {
        best = { kind: 'weapon', it };
        break;
      }
    }
  }
  if (!best) return;

  const toHint = (x, y, str) => ({ x, y, str }); // 世界坐标，HUD 换算屏幕
  if (best.kind === 'prop') {
    const prop = best.prop;
    if (prop.type === 'chest') G.hint = toHint(prop.x, prop.y - 16, 'E 打开');
    else if (prop.type === 'vend') G.hint = toHint(prop.x, prop.y - 26, 'E 购买');
    else if (prop.type === 'portal') G.hint = toHint(prop.x, prop.y - 20, 'E 进入');
    else if (prop.type === 'note') G.hint = toHint(prop.x, prop.y - 12, 'E 阅读');
    else if (prop.type === 'story') G.hint = toHint(prop.x, prop.y - 12, prop.read ? '已看过' : 'E 看看');
    else if (prop.type === 'stairs') G.hint = toHint(prop.x, prop.y - 16, 'E 走楼梯');
    else if (prop.type === 'elevator') G.hint = toHint(prop.x, prop.y - 16, 'E 电梯');
    else if (prop.type === 'manhole') G.hint = toHint(prop.x, prop.y - 14, 'E 钻下水道');
    else if (prop.type === 'overpass') G.hint = toHint(prop.x, prop.y - 16, 'E 上天桥');
    else if (prop.type === 'bench') G.hint = toHint(prop.x, prop.y - 18, 'E 合成武器');
    else if (prop.type === 'board') G.hint = toHint(prop.x, prop.y - 18, G.run.contract ? 'E 已接契约' : 'E 悬赏契约');
    if (Input.just('KeyE')) {
      if (prop.type === 'chest') {
        map.props = map.props.filter(x => x !== prop);
        prop.region && (map.regionByKey.get(prop.region).chestOpened = true);
        openChest(map, prop);
      } else if (prop.type === 'vend') shopPanel(map.regionByKey.get(prop.region));
      else if (prop.type === 'portal') usePortal.call(this);
      else if (prop.type === 'bench') combinePanel(this);
      else if (prop.type === 'stairs') doTravel('stairs', prop.dest, prop.region && map.regionByKey.get(prop.dest).level === 1 ? '顺着楼梯下到 B1' : '顺着楼梯回到 F1');
      else if (prop.type === 'elevator') elevatorPanel();
      else if (prop.type === 'manhole') doTravel('manhole', prop.dest, '从下水道钻了出来');
      else if (prop.type === 'overpass') doTravel('overpass', prop.dest, '从天桥上下来');
      else if (prop.type === 'board') {
        if (G.run.contract) showDialog({ name: '通缉板', lines: [`已接下契约：${G.run.contract.name}\n${G.run.contract.desc}\n\n报酬：本层零件收入 ×${G.run.contract.reward}`] });
        else contractPanel(this);
      }
      else if (prop.type === 'note') {
        map.props = map.props.filter(x => x !== prop);
        prop.region && (map.regionByKey.get(prop.region).noteRead = true);
        import('./meta.js').then(m => m.collectNote(prop.text));
        showDialog({ name: '捡到一份档案', lines: [prop.text] });
      }
      else if (prop.type === 'story') {
        prop.read = true;
        showDialog({ name: '记忆', portrait: 'qiqing_down_0', lines: [prop.text] });
      }
    }
  } else if (best.kind === 'revive') {
    G.hint = toHint(q.x, q.y - 24, 'E 扶起齐青');
    if (Input.just('KeyE')) {
      q.downed = false;
      q.hp = Math.round(q.maxHp * 0.5);
      q.iT = 1;
      sfx('revive');
      spawnParts(q.x, q.y, { n: 10, colors: ['#e9e7e0', '#6ac07a'], spd: 60, life: 0.5 });
      toast('齐青：……欠你一次。', '#6ac07a');
    }
  } else if (best.kind === 'qi') {
    G.hint = toHint(q.x, q.y - 22, 'E 交流');
    if (Input.just('KeyE')) companionMenu(this);
  } else if (best.kind === 'weapon') {
    G.hint = toHint(p.x, p.y - 20, 'E 换枪');
    if (Input.just('KeyE')) {
      const it = best.it;
      const old = p.slots[p.cur];
      p.slots[p.cur] = { id: it.id, def: WEAPONS[it.id] };
      map.pickups.splice(map.pickups.indexOf(it), 1);
      if (old) map.pickups.push({ type: 'weapon', id: old.id, x: it.x, y: it.y, t: 0 });
      sfx('pickup');
      toast(`换上了 ${WEAPONS[it.id].name}`);
    }
  }
}

function openChest(map, prop) {
  sfx('chest');
  spawnParts(prop.x, prop.y, { n: 10, colors: ['#e8c14a', '#fff'], spd: 80, life: 0.5 });
  let pool = G.meta.weapons.map(id => WEAPONS[id]).filter(w => w.price > 0);
  if (!pool.length) pool = Object.values(WEAPONS).filter(w => w.price > 0 && w.rarity === 0);
  if (pool.length) {
    const weighted = pool.map(w => ({ id: w.id, w: [3, 2.4, 1.4, 0.6][w.rarity] }));
    let s = 0; for (const it of weighted) s += it.w;
    let r = Math.random() * s, wid = weighted[0].id;
    for (const it of weighted) { r -= it.w; if (r <= 0) { wid = it.id; break; } }
    map.pickups.push({ type: 'weapon', id: wid, x: prop.x, y: prop.y + 14, t: 0 });
  }
  for (let i = 0; i < 12; i++) map.pickups.push({ type: 'parts', x: prop.x, y: prop.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, t: 0 });
}

function spawnEliteWeapon(map, e) {
  let pool = G.meta.weapons.map(id => WEAPONS[id]).filter(w => w.price > 0);
  if (!pool.length) pool = Object.values(WEAPONS).filter(w => w.price > 0);
  const pick = pool.filter(w => w.rarity >= 2);
  const src = pick.length ? pick : pool;
  const def = src[Math.floor(Math.random() * src.length)];
  if (def) map.pickups.push({ type: 'weapon', id: def.id, x: e.x, y: e.y, t: 0 });
}

function usePortal() {
  const run = G.run;
  if (run.floorIdx < 3) {
    sfx('teleport');
    startFade(0.5, () => loadFloor(run.floorIdx + 1));
  } else {
    startEnding();
  }
}

// ---- 结局 ----
function startEnding() {
  const run = G.run;
  run.ending = true;
  run.over = 'victory';
  setSong('rest');
  sfx('teleport');
  const allNotes = G.meta.notes.length >= 12;
  const end = allNotes ? ENDINGS.archive : (G.companion ? ENDINGS.companion : ENDINGS.rain);
  run.endingId = end.id;
  showDialog({
    name: '', portrait: null,
    lines: end.lines,
    onDone: () => {
      const stageText = CITY_STAGE_TEXT[Math.min(CITY_STAGE_TEXT.length - 1, (G.meta.stats.wins || 0) + 1)];
      openPanel({
        title: `结局 · ${end.title}`,
        hint: `第 ${(G.meta.stats.wins || 0) + 1} 次通关　本局击杀 ${run.kills} · Boss ${run.bossKills} · 零件 ${run.parts}\n${stageText}\n\n（其余结局：集齐 12 份档案、或带着齐青走到最后，会看到不同的收尾。）`,
        items: [{ label: '回到小屋', fn: () => runScene.finishRun('victory') }],
      });
    },
  });
}

// ---------------- 渲染道具与拾取 ----------------
function drawProps(ctx, map) {
  for (const prop of map.props) {
    const reg = prop.region ? map.regionByKey.get(prop.region) : null;
    const destReg = prop.dest ? map.regionByKey.get(prop.dest) : null;
    drawPropAt(ctx, prop, {
      time: G.time,
      stock: reg && reg.stock ? reg.stock : null,
      player: G.player,
      contracted: !!(G.run && G.run.contract),
      destLevel: destReg ? (destReg.level || 0) : 0,
    });
  }
}

function drawPickups(ctx, map) {
  for (const it of map.pickups) {
    const bob = Math.sin(G.time * 5 + it.x) * 1.5;
    if (it.type === 'parts') {
      drawSpr(ctx, 'gear', it.x, it.y, { scale: 0.9 });
    } else if (it.type === 'heart') {
      drawSpr(ctx, 'heart', it.x, it.y + bob, { scale: 1.4 });
    } else if (it.type === 'energy') {
      drawSpr(ctx, 'energy', it.x, it.y + bob, { scale: 1.4 });
    } else if (it.type === 'skill') {
      const def = SKILLS[it.id];
      if (!def) continue;
      drawSpr(ctx, 'skill_' + it.id, it.x, it.y + bob, { scale: 1.6 });
      ctx.strokeStyle = def.color;
      ctx.globalAlpha = 0.45 + Math.sin(G.time * 4) * 0.15;
      ctx.beginPath(); ctx.arc(it.x, it.y, 12, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
      if (G.player && dist(it.x, it.y, G.player.x, G.player.y) < 42) {
        text(ctx, def.name, it.x, it.y - 16, { size: 8, color: def.color, align: 'center' });
      }
    } else if (it.type === 'weapon') {
      const def = WEAPONS[it.id];
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(it.x, it.y + 6, 9, 3, 0, 0, 7); ctx.fill();
      drawWeaponIcon(ctx, def, it.x, it.y + bob, 1.5);
      ctx.strokeStyle = RARITY[def.rarity].color;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(it.x, it.y, 11, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
      if (G.player && dist(it.x, it.y, G.player.x, G.player.y) < 40) {
        text(ctx, def.name, it.x, it.y - 16, { size: 8, color: RARITY[def.rarity].color, align: 'center' });
      }
    }
  }
}

// hub 场景惰性引用（避免循环 import）
import { hubScene } from './hub.js';
function hubSceneLazy() { return hubScene; }
