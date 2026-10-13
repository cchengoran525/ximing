// 主入口：引导 / 主循环 / 标题页 / 转场 / 调试
import { G, setScene, startFade, toast } from './state.js';
import { Input } from './input.js';
import { initAudio, applyVolumes, sfx, setSong } from './audio.js';
import { loadMeta, resetMeta } from './save.js';
import { save, addParts } from './meta.js';
import { text, clamp } from './utils.js';
import { drawSpr } from './sprites.js';
import { WEAPONS } from './data_weapons.js';
import { hubScene } from './hub.js';
import { runScene } from './run.js';
import { updateDialogUI, renderDialogUI } from './dialogui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ---- 缩放 ----
function resize() {
  const k = Math.min(window.innerWidth / 512, window.innerHeight / 288);
  const s = k >= 1 ? Math.floor(k * 2) / 2 : k;
  canvas.style.width = 512 * s + 'px';
  canvas.style.height = 288 * s + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---- 音频需要用户手势 ----
let audioBooted = false;
function bootAudio() {
  if (!audioBooted) { audioBooted = true; initAudio(); }
}
window.addEventListener('keydown', bootAudio, { once: false });
canvas.addEventListener('mousedown', bootAudio);

// ---- 标题场景 ----
const titleScene = {
  enter() {
    setSong('title');
    G.room = null; G.run = null; G.player = null; G.companion = null;
  },
  update() {
    if (Input.anyPressed && !Input.just('KeyR')) {
      sfx('ui');
      startFade(0.4, () => setScene('hub', hubScene));
    }
  },
  render(ctx) {
    // 背景氛围：雨丝
    ctx.fillStyle = '#0d0d13';
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = 'rgba(90,110,140,0.14)';
    for (let i = 0; i < 40; i++) {
      const rx = (i * 97 + G.time * 200) % 512;
      const ry = (i * 53 + G.time * 320) % 288;
      ctx.fillRect(rx, ry, 1, 7);
    }
    // 城市剪影
    ctx.fillStyle = '#14141c';
    const sky = [[0, 190, 60, 98], [70, 160, 44, 128], [124, 200, 70, 88], [204, 150, 50, 138], [262, 178, 64, 110], [334, 168, 46, 120], [388, 196, 58, 92], [454, 174, 58, 114]];
    for (const [bx, by, bw, bh] of sky) ctx.fillRect(bx, by, bw, bh);
    // 亮窗
    ctx.fillStyle = 'rgba(232,193,85,0.25)';
    for (const [bx, by, bw, bh] of sky) {
      for (let wy = by + 8; wy < 288 - 8; wy += 12) {
        for (let wx = bx + 5; wx < bx + bw - 6; wx += 10) {
          if (((wx * 13 + wy * 7) % 23) < 4) ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
    // 角色
    drawSpr(ctx, 'qiqing_down_0', 330, 208, { scale: 3 });
    drawSpr(ctx, 'player_down_0', 286, 210, { scale: 3 });

    text(ctx, '夕 明', 150, 74, { size: 46, color: '#e8e2d0', bold: true });
    text(ctx, '余 烬 之 城', 152, 126, { size: 15, color: '#e8c14a', bold: true });
    text(ctx, '复古城市 · 类元气骑士肉鸽', 153, 148, { size: 10, color: '#8a8a98' });
    text(ctx, Input.anyPressed ? '' : '—— 按任意键 开始 ——', 256, 182, { size: 11, color: '#e8e2d0', align: 'center', alpha: 0.6 + Math.sin(G.time * 3) * 0.4 });
    text(ctx, `零件 ${G.meta.parts} · 通关 ${G.meta.stats.wins} 次 · 齐青 ${G.meta.flags.qiMet ? '已在小屋' : '尚未相遇'}`, 256, 252, { size: 9, color: '#6a6a78', align: 'center' });
    text(ctx, 'R 重置存档 · M 静音 · 调试模式加 ?debug=1', 256, 270, { size: 8, color: '#4a4a56', align: 'center' });
  },
};

G.scenes = { title: titleScene, hub: hubScene, run: runScene };

// ---- 调试作弊 ----
function cheats() {
  if (!G.debug) return;
  if (Input.just('F1')) { addParts(200); toast('+200 零件（调试）', '#e8c14a'); }
  if (Input.just('F2')) {
    G.meta.weapons = Object.keys(WEAPONS).filter(id => WEAPONS[id].price > 0);
    save(); toast('已解锁全部武器（调试）', '#e8c14a');
  }
  if (Input.just('F3')) { G.meta.flags.qiReady = true; G.meta.flags.qiMet = true; save(); toast('齐青已入住（调试）', '#e8c14a'); }
  if (Input.just('F4')) { G.god = !G.god; toast('无敌 ' + (G.god ? '开' : '关'), '#e8c14a'); }
  if (Input.just('F5') && G.room && G.room.enemies) {
    for (const e of G.room.enemies) e.hurt(99999, {});
    toast('清房（调试）', '#e8c14a');
  }
  if (Input.just('F6') && G.run) { G.player.hp = G.player.maxHp; G.player.en = G.player.maxEn; toast('回满状态（调试）', '#e8c14a'); }
}

// ---- 主循环 ----
let last = performance.now();
function tick(dt) {
  G.time += dt;
  G.frame++;

  cheats();

  // 转场
  if (G.fade) {
    G.fade.t += dt;
    if (!G.fade.midDone && G.fade.t >= G.fade.dur / 2) { G.fade.midDone = true; G.fade.mid && G.fade.mid(); }
    if (G.fade.t >= G.fade.dur) { const f = G.fade; G.fade = null; f.done && f.done(); }
  }

  // 更新
  if (G.dialog) updateDialogUI(dt);
  else if (G.scene && G.scene.update) G.scene.update(dt);

  // 静音
  if (Input.just('KeyM')) {
    G.meta.sound.music = G.meta.sound.music ? 0 : 1;
    G.meta.sound.sfx = G.meta.sound.music;
    save(); applyVolumes();
    toast(G.meta.sound.music ? '声音：开' : '声音：静音');
  }

  // 渲染
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, 512, 288);
  ctx.save();
  if (G.shake > 0.1) {
    ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  }
  if (G.scene && G.scene.render) G.scene.render(ctx);
  ctx.restore();
  G.shake *= Math.pow(0.001, dt);

  // Toasts
  for (let i = G.toasts.length - 1; i >= 0; i--) {
    const t = G.toasts[i];
    t.t -= dt;
    if (t.t <= 0) { G.toasts.splice(i, 1); continue; }
    const a = clamp(t.t / 0.4, 0, 1);
    const y = 288 - 14 - (G.toasts.length - 1 - i) * 16;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,10,15,0.75)';
    ctx.font = '10px sans-serif';
    const w = ctx.measureText(t.text).width + 12;
    ctx.fillRect(256 - w / 2, y - 10, w, 14);
    text(ctx, t.text, 256, y - 8, { size: 9, color: t.color, align: 'center' });
    ctx.globalAlpha = 1;
  }

  renderDialogUI(ctx);

  // 转场遮罩
  if (G.fade) {
    const p = G.fade.t / G.fade.dur;
    const a = p < 0.5 ? p * 2 : (1 - p) * 2;
    ctx.fillStyle = `rgba(5,5,8,${clamp(a, 0, 1)})`;
    ctx.fillRect(0, 0, 512, 288);
  }

  Input.updateFrame();
}

function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}

// 测试钩子：手动步进（后台 rAF 被节流时用）
window.__step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt); };

// ---- 启动 ----
G.meta = loadMeta();
Input.init(canvas);
window.G = G; window.Input = Input; // 调试句柄
setScene('title', titleScene);
requestAnimationFrame(frame);
