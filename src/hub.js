// 基地小屋：安全区 + 养成交互 + 齐青 + 装饰
import { G, setScene, startFade, toast } from './state.js';
import { W, H, T, drawRoom, moveEntity } from './world.js';
import { drawPlayer } from './player.js';
import { drawSpr } from './sprites.js';
import { drawHint } from './hud.js';
import { text, dist, clamp, hash2 } from './utils.js';
import { Input } from './input.js';
import { sfx, setSong, applyVolumes } from './audio.js';
import { talentsPanel, workbenchPanel, archivePanel, confirmPanel, openPanel, codexPanel } from './dialogui.js';
import { RADIO, HUB_FLAVOR, QI_CHAT, QI_CHAT_FLAVOR, CITY_RADIO, CITY_STAGE_TEXT, QI_SIDE } from './data_dialog.js';
import { save } from './meta.js';
import { runScene } from './run.js';
import { showDialog } from './dialogui.js';

const RW = 32, RH = 18;

// ---- 固定小屋（单区域地图结构） ----
function buildHubRoom() {
  const grid = new Uint8Array(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const r = ((x * 31 + y * 57) % 97) / 97;
    grid[y * RW + x] = r < 0.6 ? T.FLOOR : r < 0.85 ? T.FLOOR2 : T.FLOOR3;
  }
  for (let x = 0; x < RW; x++) { grid[x] = T.WALL; grid[(RH - 1) * RW + x] = T.WALL; }
  for (let y = 0; y < RH; y++) { grid[y * RW] = T.WALL; grid[y * RW + RW - 1] = T.WALL; }
  const windows = [];
  for (let x = 2; x < RW - 2; x++) {
    if (x % 6 === 3 || x % 6 === 4) { grid[x] = T.WALL_WINDOW; windows.push(x); }
    else if (x % 7 === 5) grid[x] = T.WALL_CRACK;
  }
  grid[(RH - 1) * RW + 15] = T.WALL_SIGN;
  grid[(RH - 1) * RW + 16] = T.WALL_SIGN;
  const hubReg = { key: 'hub', type: 'hub', x0: 0, y0: 0, w: RW, h: RH, cx: RW / 2, cy: RH / 2, cleared: true, visited: true, doors: {} };
  return {
    grid, w: RW, h: RH, biomeId: 'indoor', windows,
    regions: [hubReg], regionByKey: new Map([['hub', hubReg]]),
    gates: new Map(), lockedRegions: new Set(), engagedRegion: null,
    enemies: [], pickups: [], props: [],
    bannerT: 0, type: 'hub', key: 'hub',
  };
}

let hubRoom = null;
let flavorT = 6;

const SOLID_PROPS = ['bed', 'workbench', 'shelf', 'radiotable', 'qi', 'cabinet'];

const PROP_NAME = {
  bed: '床', workbench: '工作台', shelf: '书架', radiotable: '收音机', door: '门', qi: '齐青', cabinet: '档案柜',
};
const PROP_HINT = {
  bed: 'E 休息 / 天赋', workbench: 'E 工作台', shelf: 'E 书架', radiotable: 'E 收音机', door: 'E 出发', qi: 'E 和齐青聊聊', cabinet: 'E 档案柜',
};

export const hubScene = {
  enter() {
    setSong('hub');
    if (!hubRoom) hubRoom = buildHubRoom();
    G.room = hubRoom;
    G.run = null;
    G.cam.x = 0; G.cam.y = 0;
    if (!G.player) {
      G.player = { x: W / 2, y: H / 2 + 30, r: 6, spd: 108, hp: 6, maxHp: 6, en: 100, maxEn: 100, slots: [null, null], cur: 0, cds: [0, 0], dashT: 0, dashCd: 0, iT: 0, flash: 0, fireFlash: 0, walkT: 0, aim: 0, moveDir: { x: 0, y: 1 }, moving: false, buffs: [], shield: 0, stats: { dmgMul: 1, rateMul: 1, dashCdMul: 1, spdMul: 1, partsMul: 1, maxHp: 6, maxEn: 100 }, dead: false };
    } else {
      // 回屋重置：复活、回满、清战斗残留状态
      const p = G.player;
      p.dead = false;
      p.hp = p.maxHp; p.en = p.maxEn;
      p.iT = 0; p.flash = 0; p.dashT = 0; p.dashCd = 0; p.burst = null; p.shield = 0;
    }
    G.player.x = W / 2; G.player.y = H / 2 + 30;
    G.hint = null;

    // 旧存档兼容：若打过 Boss 但还没遇到站台剧情，直接视为已结识
    if (G.meta.flags.qiReady && !G.meta.flags.qiMet) {
      G.meta.flags.qiMet = true;
      save();
    }
  },

  update(dt) {
    if (G.dialog || G.fade) return;
    const p = G.player;
    flavorT -= dt;
    if (flavorT <= 0) { flavorT = 14 + Math.random() * 10; toast(HUB_FLAVOR[Math.floor(Math.random() * HUB_FLAVOR.length)], '#8a8a98'); }

    // 移动
    const ax = Input.axis();
    moveEntity(G.room, p, ax.x * p.spd * dt, ax.y * p.spd * dt);
    p.moving = !!(ax.x || ax.y);
    if (p.moving) { p.moveDir = { x: ax.x, y: ax.y }; p.walkT += dt * 9; }
    G.mworld.x = Input.mx; G.mworld.y = Input.my;

    // 家具碰撞
    for (const prop of this.props()) {
      if (!SOLID_PROPS.includes(prop.type)) continue;
      const d = dist(p.x, p.y, prop.x, prop.y);
      if (d < 14) {
        const a = Math.atan2(p.y - prop.y, p.x - prop.x);
        p.x = prop.x + Math.cos(a) * 14; p.y = prop.y + Math.sin(a) * 14;
      }
    }
    p.aim = Math.atan2(Input.my - p.y, Input.mx - p.x);

    // 交互
    const props = this.props();
    let best = null, bd = 34;
    for (const prop of props) {
      const d = dist(p.x, p.y, prop.x, prop.y);
      if (d < bd) { bd = d; best = prop; }
    }
    G.hint = null;
    if (best) {
      G.hint = { x: best.x, y: best.y - 20, str: PROP_HINT[best.type] || 'E' };
      if (Input.just('KeyE')) this.interact(best);
    }
    if (Input.just('Escape')) this.pausePanel();
  },

  pausePanel() {
    const snd = G.meta.sound;
    openPanel({
      title: '小屋',
      items: [
        { label: '继续', fn: () => {} },
        { label: `音乐：${snd.music ? '开' : '关'}`, fn: () => { snd.music = snd.music ? 0 : 1; save(); applyVolumes(); this.pausePanel(); } },
        { label: `音效：${snd.sfx ? '开' : '关'}`, fn: () => { snd.sfx = snd.sfx ? 0 : 1; save(); applyVolumes(); this.pausePanel(); } },
        { label: '回到标题', fn: () => { G.dialog = null; startFade(0.4, () => setScene('title', G.scenes.title)); } },
      ],
    });
  },

  props() {
    const list = [
      { type: 'bed', x: 64, y: 224 },
      { type: 'workbench', x: 150, y: 230 },
      { type: 'shelf', x: 330, y: 228 },
      { type: 'radiotable', x: 430, y: 140 },
      { type: 'cabinet', x: 398, y: 172 },
      { type: 'door', x: 248, y: H - 22 },
    ];
    if (G.meta.flags.qiMet) list.push({ type: 'qi', x: 386, y: 92 });
    return list;
  },

  interact(prop) {
    sfx('ui');
    switch (prop.type) {
      case 'bed': talentsPanel(); break;
      case 'workbench': workbenchPanel(); break;
      case 'shelf': archivePanel(); break;
      case 'cabinet': codexPanel(); break;
      case 'radio':
      case 'radiotable': {
        sfx('static');
        const stage = Math.min(3, G.meta.stats.wins || 0);
        const pool = [...RADIO, ...CITY_RADIO.slice(0, stage)];
        showDialog({ name: '收音机', lines: [pool[Math.floor(Math.random() * pool.length)]] });
        break;
      }
      case 'door': {
        const eq = G.meta.equipped.map(id => ({ t_hp: '老练幸存者', t_en: '电池腰带', t_dash: '夜行者', t_shield: '战前存货', t_parts: '拾荒人脉', t_start: '缴获惯例', t_regen: '战地急救', t_dmg: '孤注一掷', t_wolf: '狼群默契' }[id])).filter(Boolean);
        confirmPanel('整装出发？', `携带天赋：${eq.length ? eq.join('、') : '（无）'}${G.meta.flags.qiMet ? '\n齐青：' + (G.meta.companion ? '「走吧。」' : '「这次我自己留在家。」') : ''}`, () => {
          startFade(0.5, () => setScene('run', runScene, { fresh: true }));
        });
        break;
      }
      case 'qi': this.qiMenu(); break;
    }
  },

  qiMenu() {
    const stage = clamp(G.meta.flags.qiStage || 0, 0, QI_CHAT.length - 1);
    const items = [
      { label: '聊天', sub: '他还挺能说的。', fn: () => {
          showDialog({
            name: '齐青', portrait: 'qiqing_down_0',
            lines: QI_CHAT[stage].lines,
            onDone: () => { G.meta.flags.qiStage = Math.min((G.meta.flags.qiStage || 0) + 1, QI_CHAT.length); save(); },
          });
        } },
    ];
    items.push({
      label: G.meta.flags.qiSideDone ? '再陪他走一趟' : '跟他去一个地方',
      sub: G.meta.flags.qiSideDone
        ? '旧营房。他偶尔还是想去看一眼。'
        : '「有件事，拖了很久。想请你搭把手。」',
      color: '#e8b84a',
      fn: () => { G.dialog = null; this.startQiSide(); },
    });
    items.push({
      label: G.meta.companion ? '这次留在家' : '带上你',
      sub: G.meta.companion ? '他会在小屋等你回来。' : '他会带着伞跟你出门，自己战斗、自己走位。',
      fn: () => { G.meta.companion = !G.meta.companion; save(); sfx('ui'); this.qiMenu(); },
    });
    items.push({ label: '随便聊聊', sub: '雨声背景音。', fn: () => showDialog({ name: '齐青', portrait: 'qiqing_down_0', lines: [QI_CHAT_FLAVOR[Math.floor(Math.random() * QI_CHAT_FLAVOR.length)]] }) });
    openPanel({
      title: '齐青 · 窗边',
      items,
      hint: G.meta.flags.qiBond ? '「伞修好了。比在队里那会儿顺手。」' : '「窗外的雨小了。」',
      w: 360,
    });
  },

  // 齐青支线：旧卫戍营房
  startQiSide() {
    showDialog({
      name: '齐青', portrait: 'qiqing_down_0',
      lines: QI_SIDE.intro,
      onDone: () => {
        G.meta.companion = true;
        save();
        startFade(0.5, () => setScene('run', runScene, { fresh: true, mode: 'qi' }));
      },
    });
  },

  // ---------- 渲染 ----------
  render(ctx) {
    const lv = G.meta.house;
    drawRoom(ctx, hubRoom, G.time, { x: 0, y: 0 });
    this.drawWindows(ctx);
    this.drawRug(ctx, lv);
    this.drawDecor(ctx, lv);

    // 家具
    drawSpr(ctx, 'bed', 64, 224);
    // 床头柜 + 水壶
    ctx.fillStyle = '#5d4a30'; ctx.fillRect(98, 228, 18, 12);
    ctx.fillStyle = '#6e5a3c'; ctx.fillRect(98, 228, 18, 3);
    ctx.fillStyle = '#8d939c'; ctx.fillRect(103, 221, 8, 7);
    ctx.fillStyle = '#b8b4a8'; ctx.fillRect(103, 218, 8, 3);
    if (lv >= 1) {
      // 水壶蒸汽（飘动）
      ctx.fillStyle = 'rgba(216,212,202,0.5)';
      for (let i = 0; i < 3; i++) {
        const t = (G.time * 0.9 + i * 0.33) % 1;
        ctx.globalAlpha = 0.55 * (1 - t);
        ctx.fillRect(105 + Math.sin(t * 6 + i) * 2, 216 - t * 14, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    // 工作台
    ctx.fillStyle = '#5d4a30'; ctx.fillRect(134, 222, 34, 16);
    ctx.fillStyle = '#6e5a3c'; ctx.fillRect(134, 222, 34, 4);
    ctx.fillStyle = '#8d939c'; ctx.fillRect(140, 216, 8, 6);
    ctx.fillStyle = '#e8c14a'; ctx.fillRect(152, 217, 5, 5);
    ctx.fillStyle = '#3a3f46'; ctx.fillRect(160, 215, 6, 8);
    drawSpr(ctx, 'bookshelf', 330, 226);
    // 收音机小桌
    ctx.fillStyle = '#5d4a30'; ctx.fillRect(418, 146, 24, 10);
    ctx.fillStyle = '#4a3c28'; ctx.fillRect(420, 156, 4, 8); ctx.fillRect(436, 156, 4, 8);
    drawSpr(ctx, 'radio', 430, 140);
    // 档案柜（两层抽屉 + 顶上的一沓纸）
    ctx.fillStyle = '#4a3c28'; ctx.fillRect(388, 156, 20, 30);
    ctx.fillStyle = '#5d4a30'; ctx.fillRect(389, 157, 18, 28);
    ctx.fillStyle = '#2e2620';
    ctx.fillRect(390, 161, 16, 8); ctx.fillRect(390, 172, 16, 8);
    ctx.fillStyle = '#c8a04a';
    ctx.fillRect(396, 164, 4, 2); ctx.fillRect(396, 175, 4, 2);
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(391, 152, 14, 3);
    ctx.fillStyle = '#b8b0a0'; ctx.fillRect(393, 149, 10, 3);
    // 大门
    ctx.fillStyle = '#4a3c28'; ctx.fillRect(240, H - 18, 16, 18);
    ctx.fillStyle = '#5d4a30'; ctx.fillRect(242, H - 16, 12, 16);
    ctx.fillStyle = '#e8c14a'; ctx.fillRect(251, H - 9, 2, 2);
    // 门边的伞
    ctx.save();
    ctx.translate(222, 250);
    ctx.rotate(0.5);
    drawSpr(ctx, 'umbrella', 0, 0, { ax: 0, ay: 0.5 });
    ctx.restore();

    // 齐青
    if (G.meta.flags.qiMet) {
      drawSpr(ctx, 'qiqing_down_0', 386, 92 + Math.sin(G.time * 2) * 1.2);
      // 他脚边的小板凳
      ctx.fillStyle = '#6e5a3c'; ctx.fillRect(360, 104, 12, 5);
      ctx.fillStyle = '#4a3c28'; ctx.fillRect(361, 109, 2, 5); ctx.fillRect(369, 109, 2, 5);
    }

    drawPlayer(ctx);

    // 家具名字标签（靠近时换成 E 提示气泡）
    for (const prop of this.props()) {
      const d = dist(G.player.x, G.player.y, prop.x, prop.y);
      if (d < 34) continue; // 交给提示气泡
      text(ctx, PROP_NAME[prop.type] || '', prop.x, prop.y - 26, { size: 8, color: '#8a8a98', align: 'center', alpha: 0.85 });
    }
    drawHint(ctx);

    text(ctx, '小屋 · 余烬之城边缘', 10, 268, { size: 9, color: '#6a6a78' });
    const stage = Math.min(3, G.meta.stats.wins || 0);
    text(ctx, CITY_STAGE_TEXT[stage], 10, 258, { size: 8, color: '#6a6a78' });
    text(ctx, `零件 ${G.meta.parts}`, 502, 8, { size: 11, color: '#e8c14a', align: 'right', bold: true });
  },

  // 窗外：夜雨（城市演进后亮窗更多、贴出横幅）
  drawWindows(ctx) {
    const stage = Math.min(3, G.meta.stats.wins || 0);
    for (const wx of hubRoom.windows) {
      const px = wx * 16, py = 0;
      // 夜空
      ctx.fillStyle = '#141a2a'; ctx.fillRect(px + 2, py + 5, 12, 8);
      ctx.fillStyle = '#1e283e'; ctx.fillRect(px + 3, py + 6, 4, 6);
      // 远处灯光
      ctx.fillStyle = 'rgba(232,193,85,0.35)';
      const h = hash2(wx, 0, 5);
      ctx.fillRect(px + 3 + Math.floor(h * 8), py + 9, 1, 1);
      ctx.fillRect(px + 4 + Math.floor(h * 6), py + 11, 1, 1);
      // 城市演进：对面楼的灯多起来
      if (stage >= 1) {
        ctx.fillStyle = `rgba(232,193,85,${0.15 + stage * 0.12})`;
        for (let i = 0; i < stage * 2; i++) {
          ctx.fillRect(px + 3 + Math.floor(hash2(wx, i, 11) * 9), py + 7 + Math.floor(hash2(wx, i, 13) * 5), 1, 1);
        }
      }
      // 雨丝
      ctx.fillStyle = 'rgba(150,180,220,0.55)';
      for (let i = 0; i < 4; i++) {
        const t = (G.time * 2.2 + i * 0.27 + hash2(wx, i, 9)) % 1;
        const rx = px + 2 + Math.floor(hash2(wx, i, 3) * 10);
        const ry = py + 5 + Math.floor(t * 8);
        ctx.fillRect(rx, ry, 1, 2);
      }
      // 十字窗框
      ctx.fillStyle = '#3c3229';
      ctx.fillRect(px + 8, py + 5, 1, 8);
      ctx.fillRect(px + 2, py + 9, 12, 1);
    }
    // 城市演进：墙上挂出旧旗帜
    if (stage >= 2) {
      ctx.fillStyle = '#6e2230';
      ctx.fillRect(300, 2, 22, 13);
      ctx.fillStyle = '#8c2f3a';
      ctx.fillRect(301, 3, 20, 11);
      ctx.fillStyle = '#e8c14a';
      ctx.fillRect(308, 6, 6, 2); ctx.fillRect(309, 9, 4, 1);
    }
  },

  drawRug(ctx, lv) {
    // 地毯：随小屋等级变大、加边饰
    const rw = 110 + lv * 14, rh = 70 + lv * 8;
    const rx = 256 - rw / 2, ry = 185 - rh / 2;
    ctx.fillStyle = lv >= 2 ? 'rgba(150,52,64,0.4)' : 'rgba(140,47,58,0.35)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(232,193,85,0.4)';
    ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
    if (lv >= 1) {
      ctx.strokeStyle = 'rgba(232,193,85,0.22)';
      ctx.strokeRect(rx + 5.5, ry + 5.5, rw - 11, rh - 11);
    }
  },

  drawDecor(ctx, lv) {
    // 挂钟（会走）
    const cx = 170, cy = 9;
    ctx.fillStyle = '#4a3c28'; ctx.fillRect(cx - 6, cy - 6, 12, 12);
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(cx - 5, cy - 5, 10, 10);
    const minA = (G.time / 60) * Math.PI * 2;
    const hrA = (G.time / 720) * Math.PI * 2;
    ctx.strokeStyle = '#2a2a34';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(minA) * 4, cy - Math.cos(minA) * 4); ctx.stroke();
    ctx.strokeStyle = '#5a3a2a';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(hrA) * 3, cy - Math.cos(hrA) * 3); ctx.stroke();
    ctx.fillStyle = '#e8c14a'; ctx.fillRect(cx - 1, cy - 1, 2, 2);

    // 相框（等级 1+）
    if (lv >= 1) {
      for (const fx of [118, 212]) {
        ctx.fillStyle = '#4a3c28'; ctx.fillRect(fx - 5, 3, 10, 10);
        ctx.fillStyle = '#2e3448'; ctx.fillRect(fx - 4, 4, 8, 8);
        ctx.fillStyle = '#8c6a4a'; ctx.fillRect(fx - 3, 8, 6, 2);
        ctx.fillStyle = '#d8d0c0'; ctx.fillRect(fx - 2, 5, 1, 3);
      }
    }

    // 吊灯
    ctx.fillStyle = '#2a2a34';
    ctx.fillRect(255, 16, 2, 14);
    ctx.fillStyle = '#8a7a2c';
    ctx.fillRect(252, 30, 8, 5);
    ctx.fillStyle = 'rgba(232,193,85,0.9)';
    ctx.fillRect(254, 33, 4, 3);
    if (lv >= 2) {
      const g = ctx.createRadialGradient(256, 36, 6, 256, 60, 150);
      g.addColorStop(0, 'rgba(232,193,85,0.16)');
      g.addColorStop(1, 'rgba(232,193,85,0)');
      ctx.fillStyle = g;
      ctx.fillRect(100, 20, 320, 200);
    }

    // 凳子（等级 1+）
    if (lv >= 1) {
      ctx.fillStyle = '#6e5a3c'; ctx.fillRect(300, 186, 14, 6);
      ctx.fillStyle = '#4a3c28'; ctx.fillRect(302, 192, 2, 7); ctx.fillRect(310, 192, 2, 7);
    }

    // 零件箱（堆在仕事台旁，随总收获变多）
    ctx.fillStyle = '#7a5c38'; ctx.fillRect(185, 232, 14, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(185, 232, 14, 2);
    ctx.fillStyle = '#c8a04a'; ctx.fillRect(189, 236, 6, 3);
    if (G.meta.totalEarned >= 200) {
      ctx.fillStyle = '#6e5233'; ctx.fillRect(186, 224, 12, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(186, 224, 12, 2);
    }

    // 书架上的盆栽（等级 2）
    if (lv >= 2) {
      ctx.fillStyle = '#a03a44'; ctx.fillRect(366, 220, 6, 6);
      ctx.fillStyle = '#4a7a52'; ctx.fillRect(367, 214, 4, 6);
    }
  },
};
