// 对话框与面板 UI（菜单、商店、工作台、天赋、档案等）
import { G, toast } from './state.js';
import { sfx } from './audio.js';
import { drawSpr } from './sprites.js';
import { Input } from './input.js';
import { text, clamp } from './utils.js';
import { WEAPONS, RARITY } from './data_weapons.js';
import { TALENTS, BUFFS } from './data_buffs.js';
import { unlockWeapon, unlockTalent, toggleEquip, trySpend, save, checkAchievements } from './meta.js';
import { applyVolumes } from './audio.js';
import { QI_CHAT_FLAVOR } from './data_dialog.js';
import { COMBOS, comboResult } from './data_weapons.js';
import { CONTRACTS, CONTRACT_IDS } from './data_contracts.js';
import { SKILLS } from './data_skills.js';
import { ACHIEVEMENTS, TOTAL_ACHIEVEMENTS } from './data_achievements.js';
import { ENEMIES, BOSSES } from './data_enemies.js';

// ---------------- 通用 ----------------
export function wrapText(ctx, str, maxW, size = 10) {
  ctx.font = `${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
  }
  return out;
}

export function showDialog({ name = '', portrait = null, lines = [], choices = null, onDone = null }) {
  G.dialog = { type: 'dialog', name, portrait, lines, li: 0, chars: 0, choices, sel: -1, onDone };
}

export function openPanel({ title = '', items = [], onDone = null, hint = '', w = 390 }) {
  G.dialog = { type: 'panel', title, items, onDone, hint, w, scroll: 0, hover: -1 };
}

export function confirmPanel(title, desc, cb) {
  openPanel({
    title,
    hint: desc,
    items: [
      { label: '确认', fn: () => { G.dialog = null; cb(); } },
      { label: '取消', fn: () => {} },
    ],
  });
}

// ---------------- 面板构建 ----------------
export function workbenchPanel() {
  const items = [];
  for (const id of Object.keys(WEAPONS)) {
    const w = WEAPONS[id];
    if (w.price <= 0) continue;
    const unlocked = G.meta.weapons.includes(id);
    if (unlocked) {
      items.push({
        label: `${w.name} · ${RARITY[w.rarity].name}`,
        sub: w.desc, color: RARITY[w.rarity].color, right: '已入池 ✓',
        disabled: true,
      });
    } else {
      items.push({
        label: `??? · ${RARITY[w.rarity].name}`,
        sub: `解锁后进入宝箱/商店掉落池。售价 ${w.price} 零件。`,
        right: `${w.price} 零件`,
        color: RARITY[w.rarity].color,
        fn: () => {
          if (unlockWeapon(id)) { sfx('buy'); toast(`已解锁：${w.name}`); workbenchPanel(); }
          else { sfx('deny'); toast('零件不足', '#e05540'); }
        },
      });
    }
  }
  openPanel({ title: `工作台 · 零件 ${G.meta.parts}`, items, hint: '解锁的武器会出现在宝箱、商店与精英掉落中。' });
}

export function talentsPanel() {
  const items = [];
  for (const id of Object.keys(TALENTS)) {
    const t = TALENTS[id];
    const unlocked = G.meta.talents.includes(id);
    const equipped = G.meta.equipped.includes(id);
    if (!unlocked) {
      const lockedByQi = t.needQi && !G.meta.flags.qiMet;
      items.push({
        label: `${t.name}（未解锁）`, sub: t.desc + (lockedByQi ? '（需要齐青入住后解锁）' : ''),
        right: lockedByQi ? '需齐青' : `${t.price} 零件`,
        disabled: lockedByQi,
        fn: lockedByQi ? null : () => {
          if (unlockTalent(id)) { sfx('buy'); toast(`已解锁天赋：${t.name}`); talentsPanel(); }
          else { sfx('deny'); toast('零件不足', '#e05540'); }
        },
      });
    } else if (equipped) {
      items.push({ label: t.name, sub: t.desc, right: '已装备 ✓', color: '#e8b84a', fn: () => { toggleEquip(id); talentsPanel(); } });
    } else {
      items.push({
        label: t.name, sub: t.desc, right: G.meta.equipped.length >= 2 ? '名额已满' : '装备',
        disabled: G.meta.equipped.length >= 2,
        fn: () => { if (toggleEquip(id)) { sfx('ui'); talentsPanel(); } },
      });
    }
  }
  openPanel({ title: `床 · 天赋（${G.meta.equipped.length}/2）· 零件 ${G.meta.parts}`, items, hint: '每局出发前最多携带 2 个天赋。' });
}

export function archivePanel() {
  const items = [];
  if (!G.meta.notes.length) items.push({ label: '（书架还空着。去城里翻翻抽屉和墙角吧。）', disabled: true });
  G.meta.notes.forEach((n, i) => {
    items.push({ label: n.split('\n')[0].slice(0, 22), sub: '', right: '阅读', fn: () => showDialog({ name: '档案', lines: [n] }) });
  });
  openPanel({ title: `书架 · 收集的档案（${G.meta.notes.length}）`, items, hint: '这座城市的记录散落在各个角落。' });
}

export function shopPanel(room) {
  const items = [];
  room.stock.forEach((s, i) => {
    if (s.sold) { items.push({ label: '（已售出）', disabled: true }); return; }
    if (s.kind === 'weapon') {
      const w = WEAPONS[s.id];
      items.push({
        label: `${w.name} · ${RARITY[w.rarity].name}`, sub: w.desc, color: RARITY[w.rarity].color,
        right: `${s.price} 零件`,
        fn: () => buyShop(room, i),
      });
    } else if (s.kind === 'heal') {
      items.push({ label: '军用急救包', sub: '回复 4 点生命。', color: '#6ac07a', right: `${s.price} 零件`, fn: () => buyShop(room, i) });
    } else if (s.kind === 'skill') {
      const sk = SKILLS[s.id];
      items.push({ label: `技能：${sk.name}`, sub: sk.desc + `（冷却 ${sk.cd} 秒，F 键释放）`, color: sk.color, right: `${s.price} 零件`, fn: () => buyShop(room, i) });
    } else {
      const b = BUFFS[s.id];
      items.push({ label: `强化剂：${b.name}`, sub: b.desc, color: '#b070e0', right: `${s.price} 零件`, fn: () => buyShop(room, i) });
    }
  });
  openPanel({ title: `售货机 · 零件 ${G.meta.parts}`, items, hint: '「扫这里。谢谢惠顾。」——机器上的贴纸' });
}

function buyShop(room, i) {
  const s = room.stock[i];
  if (!s || s.sold) return;
  if (!trySpend(s.price)) { sfx('deny'); toast('零件不足', '#e05540'); return; }
  s.sold = true;
  sfx('buy');
  const p = G.player;
  if (s.kind === 'weapon') {
    if (!p.slots[0]) { p.slots[0] = { id: s.id, def: WEAPONS[s.id] }; toast(`装备了 ${WEAPONS[s.id].name}`); }
    else if (!p.slots[1]) { p.slots[1] = { id: s.id, def: WEAPONS[s.id] }; toast(`装备了 ${WEAPONS[s.id].name}`); }
    else {
      room.pickups.push({ type: 'weapon', id: s.id, x: p.x + 14, y: p.y + 10, t: 0 });
      toast('武器放在了脚边');
    }
  } else if (s.kind === 'heal') {
    p.hp = Math.min(p.maxHp, p.hp + 4); sfx('heal');
  } else if (s.kind === 'skill') {
    p.skill = { id: s.id, def: SKILLS[s.id] };
    p.skillCd = 0;
    toast(`装备技能：${SKILLS[s.id].name}（F 释放）`, SKILLS[s.id].color);
  } else {
    G.scene && G.scene.addBuffToPlayer && G.scene.addBuffToPlayer(s.id);
    toast(`获得强化：${BUFFS[s.id].name}`, '#b070e0');
  }
  shopPanel(room);
}

// ---- 合成台 ----
export function combinePanel(run) {
  const p = G.player;
  const a = p.slots[0], b = p.slots[1];
  const items = [];
  const out = comboResult(a && a.id, b && b.id);
  if (out) {
    const def = WEAPONS[out];
    items.push({
      label: `合成：${a.def.name} + ${b.def.name}`,
      sub: `→ ${def.name}：${def.desc}`,
      color: '#e8c14a',
      right: '立即合成',
      fn: () => run.combine(),
    });
  }
  for (const c of COMBOS) {
    const has = !!(a && b) && ((a.id === c.a && b.id === c.b) || (a.id === c.b && b.id === c.a));
    items.push({
      label: `${WEAPONS[c.a].name} + ${WEAPONS[c.b].name}`,
      sub: `→ ${WEAPONS[c.out].name}：${WEAPONS[c.out].desc}`,
      right: has ? '材料齐备' : '',
      color: has ? '#6ac07a' : '#8a8a98',
      disabled: !has,
    });
  }
  openPanel({
    title: '合成台',
    items,
    hint: '把装备里的两把武器按配方拼成一件。合成武器不会出现在掉落池里。',
    w: 400,
  });
}

// ---- 通缉板 · 悬赏契约 ----
export function contractPanel(run) {
  const pool = CONTRACT_IDS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  const items = pool.map(id => {
    const c = CONTRACTS[id];
    return {
      label: c.name,
      sub: `${c.desc}　→　本层零件收入 ×${c.reward}`,
      right: `零件 ×${c.reward}`,
      color: '#e8b84a',
      fn: () => {
        G.run.contract = c;
        G.meta.stats.contracts = (G.meta.stats.contracts || 0) + 1;
        save();
        checkAchievements(true);
        sfx('ui');
        toast(`接下契约：${c.name}（零件 ×${c.reward}）`, '#e8b84a');
        G.dialog = null;
      },
    };
  });
  items.push({ label: '什么都不接', sub: '本层照常，不受任何限制。', fn: () => {} });
  openPanel({ title: '通缉板 · 悬赏契约', items, hint: '风险换报酬。每层最多接一张，接了就不能反悔。', w: 400 });
}

// ---- 档案柜：图鉴 / 成就 / 统计 ----
export function codexPanel() {
  const enemies = [...Object.values(ENEMIES), ...Object.values(BOSSES)];
  const kills = G.meta.codex.kills;
  const seenEnemies = enemies.filter(e => kills[e.id]).length;
  const seenWeapons = G.meta.codex.weapons.length;
  const totalWeapons = Object.keys(WEAPONS).length;
  openPanel({
    title: '档案柜',
    items: [
      { label: '敌人图鉴', sub: '交过手的敌人会留下记录。', right: `${seenEnemies}/${enemies.length}`, fn: () => enemyCodexPanel() },
      { label: '武器图鉴', sub: '拿到过手的武器，含合成产物。', right: `${seenWeapons}/${totalWeapons}`, fn: () => weaponCodexPanel() },
      { label: '成就', sub: '达成即发放零件奖励。', right: `${G.meta.ach.length}/${TOTAL_ACHIEVEMENTS}`, color: '#e8b84a', fn: () => achPanel() },
      { label: '统计', sub: '这座城市记得你做过什么。', fn: () => statsPanel() },
    ],
    hint: '抽屉里都是别人留下的东西——现在也有你的一份。',
  });
}

function enemyCodexPanel() {
  const items = [{ label: '← 返回', fn: () => codexPanel() }];
  const all = [...Object.values(ENEMIES), ...Object.values(BOSSES)];
  for (const e of all) {
    const k = G.meta.codex.kills[e.id] || 0;
    if (!k) items.push({ label: '？？？', sub: '还没有交过手。', disabled: true });
    else items.push({
      label: e.name + (e.title ? `·${e.title}` : ''),
      sub: `生命 ${e.hp}　击杀 ${k} 次`,
      right: `${k} 次`,
      color: e.title ? '#c04a3a' : '#c9c9c9',
    });
  }
  openPanel({ title: '敌人图鉴', items, hint: '公路之外还有些什么，慢慢就知道了。', w: 360 });
}

function weaponCodexPanel() {
  const items = [{ label: '← 返回', fn: () => codexPanel() }];
  for (const id of Object.keys(WEAPONS)) {
    const w = WEAPONS[id];
    if (!G.meta.codex.weapons.includes(id)) {
      items.push({ label: '？？？', sub: '还没拿到过。', disabled: true });
    } else {
      items.push({
        label: `${w.name} · ${RARITY[w.rarity].name}`,
        sub: `${w.desc}\n伤害 ${w.dmg}${w.count > 1 ? `×${w.count}` : ''}　间隔 ${w.rate}s　耗能 ${w.cost}`,
        color: RARITY[w.rarity].color,
      });
    }
  }
  openPanel({ title: `武器图鉴（${G.meta.codex.weapons.length}）`, items, hint: '合成武器也要拿到手才算收录。', w: 400 });
}

function achPanel() {
  const items = [{ label: '← 返回', fn: () => codexPanel() }];
  for (const a of ACHIEVEMENTS) {
    const got = G.meta.ach.includes(a.id);
    items.push({
      label: (got ? '✓ ' : '· ') + a.name,
      sub: a.desc + `（奖励 ${a.reward} 零件）`,
      right: got ? '已达成' : '',
      color: got ? '#6ac07a' : '#8a8a98',
      disabled: true,
    });
  }
  openPanel({ title: `成就（${G.meta.ach.length}/${TOTAL_ACHIEVEMENTS}）`, items, hint: '达成时奖励会自动打进零件账户。', w: 400 });
}

function statsPanel() {
  const s = G.meta.stats;
  const c = G.meta.codex;
  const lines = [
    ['出击次数', s.runs || 0],
    ['通关次数', s.wins || 0],
    ['倒在小屋之外', s.deaths || 0],
    ['累计击杀', s.kills || 0],
    ['击败区域 Boss', s.bosses || 0],
    ['击败精英', s.elites || 0],
    ['武器合成', s.combos || 0],
    ['接下契约', s.contracts || 0],
    ['累计带回零件', G.meta.totalEarned || 0],
    ['收集档案', G.meta.notes.length],
    ['图鉴收录击杀', Object.keys(c.kills).length + ' 种敌人'],
  ];
  openPanel({
    title: '统计',
    items: [
      { label: '← 返回', fn: () => codexPanel() },
      ...lines.map(([k, v]) => ({ label: k, right: '' + v, disabled: true })),
    ],
    hint: `存档版本 v${G.meta.v}　·　小屋等级 ${G.meta.house}`,
    w: 340,
  });
}

export function buffChoicePanel(ids, cb) {
  const items = ids.map(id => {
    const b = BUFFS[id];
    return { label: b.name, sub: b.desc, color: '#b070e0', fn: () => cb(id) };
  });
  openPanel({ title: '齐青翻出了他的存货', items, hint: '「拿去吧。反正我一只狼用不完。」', w: 340 });
}

export function companionMenu(run) {
  const q = G.companion;
  const items = [
    {
      label: `互换武器（他拿着：${q.weapon.def.name}）`,
      sub: '把你当前的武器和他手里的换一下。',
      fn: () => { run.swapWeapon(); },
    },
  ];
  if (q.carried.length) {
    items.push({
      label: `拿回代管武器（${q.carried.length}）`,
      sub: '他替你捡起来的东西。',
      fn: () => { run.retrieveCarried(); companionMenu(run); },
    });
  }
  items.push({
    label: G.run.buffShareUsed.has(G.run.floorIdx) ? '共享加成（本层已用）' : '共享加成',
    sub: '每层一次，他从随身口袋里翻两样强化给你挑。',
    disabled: G.run.buffShareUsed.has(G.run.floorIdx),
    fn: () => { run.shareBuff(); },
  });
  items.push({
    label: '闲聊两句',
    sub: '枪声间隙里的一点安静。',
    fn: () => { G.dialog = null; showDialog({ name: '齐青', portrait: 'qiqing_down_0', lines: [QI_CHAT_FLAVOR[Math.floor(Math.random() * QI_CHAT_FLAVOR.length)]] }); },
  });
  openPanel({ title: '齐青', items, hint: '「说吧，我听着。」', w: 360 });
}

export function pausePanel(run) {
  const snd = G.meta.sound;
  openPanel({
    title: '暂停',
    items: [
      { label: '继续', fn: () => {} },
      { label: `音乐：${snd.music ? '开' : '关'}`, fn: () => { snd.music = snd.music ? 0 : 1; save(); applyVolumes(); pausePanel(run); } },
      { label: `音效：${snd.sfx ? '开' : '关'}`, fn: () => { snd.sfx = snd.sfx ? 0 : 1; save(); applyVolumes(); pausePanel(run); } },
      { label: '放弃本局（带走零件）', fn: () => { G.dialog = null; run.finishRun('quit'); } },
    ],
    hint: '雾都的雨声里，稍作休息。',
  });
}

// ---------------- 更新与渲染 ----------------
let wheelDelta = 0;
window.addEventListener('wheel', e => { wheelDelta += e.deltaY; }, { passive: true });

export function updateDialogUI(dt) {
  const d = G.dialog;
  if (!d) return;
  if (d.type === 'dialog') {
    const line = d.lines[d.li] || '';
    if (d.chars < line.length) {
      d.chars += dt * 36;
      if (Input.just('KeyE') || Input.just('Enter') || Input.just('Space') || Input.mpressed) d.chars = line.length;
      return;
    }
    // 选择项 hover
    if (d.choices && d.li === d.lines.length - 1) {
      d.sel = -1;
      d.choices.forEach((c, i) => {
        const y = 208 + i * 20;
        if (Input.my > y - 14 && Input.my < y + 6 && Input.mx > 300 && Input.mx < 500) d.sel = i;
      });
      d.choices.forEach((c, i) => {
        if (d.sel === i && Input.mpressed) { sfx('ui'); G.dialog = null; c.fn && c.fn(); }
      });
    }
    if (Input.just('KeyE') || Input.just('Enter') || Input.just('Space') || Input.mpressed) {
      if (d.li < d.lines.length - 1) { d.li++; d.chars = 0; sfx('ui'); }
      else { sfx('ui_back'); const cb = d.onDone; G.dialog = null; cb && cb(); }
    }
    if (Input.just('Escape')) { const cb = d.onDone; G.dialog = null; cb && cb(); }
    return;
  }
  if (d.type === 'panel') {
    // 滚动
    if (wheelDelta) { d.scroll = clamp(d.scroll + wheelDelta * 0.5, 0, Math.max(0, d.items.length * 24 - 190)); wheelDelta = 0; }
    // hover
    const bx = (512 - d.w) / 2, by = 26;
    const y0 = by + 34;
    d.hover = -1;
    const vis = Math.min(d.items.length, 9);
    for (let i = 0; i < vis; i++) {
      const idx = i + Math.floor(d.scroll / 24);
      if (idx >= d.items.length) break;
      const y = y0 + i * 24;
      if (Input.my > y && Input.my < y + 22 && Input.mx > bx + 6 && Input.mx < bx + d.w - 6) d.hover = idx;
    }
    if (Input.mpressed && d.hover >= 0) {
      const it = d.items[d.hover];
      if (it.fn && !it.disabled) { sfx('ui'); it.fn(); }
      else if (it.disabled) sfx('deny');
      // 注意：fn 可能重建 G.dialog，此时不要再访问 d
      return;
    }
    if (Input.just('Escape')) { sfx('ui_back'); const cb = d.onDone; G.dialog = null; cb && cb(); }
  }
}

function panelBox(ctx, d) {
  const vis = Math.min(d.items.length, 9);
  const h = 44 + vis * 24 + (d.hint ? 34 : 10);
  const bx = Math.round((512 - d.w) / 2), by = 26;
  ctx.fillStyle = 'rgba(10,10,15,0.55)';
  ctx.fillRect(0, 0, 512, 288);
  ctx.fillStyle = '#1c1c24';
  ctx.fillRect(bx, by, d.w, h);
  ctx.strokeStyle = '#5a5a68';
  ctx.strokeRect(bx + 0.5, by + 0.5, d.w - 1, h - 1);
  ctx.fillStyle = '#14141a';
  ctx.fillRect(bx + 1, by + 1, d.w - 2, 24);
  text(ctx, d.title, bx + 10, by + 7, { size: 11, color: '#e8e2d0', bold: true });
  // 关闭提示
  text(ctx, 'Esc 关闭', bx + d.w - 10, by + 7, { size: 9, color: '#6a6a78', align: 'right' });
  return { bx, by, y0: by + 34, vis };
}

export function renderDialogUI(ctx) {
  const d = G.dialog;
  if (!d) return;
  if (d.type === 'dialog') {
    const line = d.lines[d.li] || '';
    const shown = line.slice(0, Math.floor(d.chars));
    const bx = 14, by = 192, bw = 484, bh = 84;
    ctx.fillStyle = 'rgba(10,10,15,0.45)';
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = '#1c1c24';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#5a5a68';
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    if (d.portrait) {
      ctx.fillStyle = '#14141a';
      ctx.fillRect(bx + 4, by + 4, 52, 76);
      drawSpr(ctx, d.portrait, bx + 30, by + 44, { scale: 3 });
    }
    if (d.name) text(ctx, d.name, bx + (d.portrait ? 66 : 12), by + 6, { size: 11, color: '#e8b84a', bold: true });
    const tx = bx + (d.portrait ? 66 : 12);
    const lines = wrapText(ctx, shown, bw - (tx - bx) - 14, 10);
    lines.slice(0, 4).forEach((l, i) => text(ctx, l, tx, by + 24 + i * 14, { size: 10 }));
    // 选择项
    if (d.choices && d.li === d.lines.length - 1 && d.chars >= line.length) {
      d.choices.forEach((c, i) => {
        const y = 208 + i * 20;
        const hov = d.sel === i;
        text(ctx, (hov ? '▸ ' : '  ') + c.label, 306, y - 12, { size: 11, color: hov ? '#e8b84a' : '#c9c9c9', bold: hov });
      });
    } else {
      text(ctx, '▼', 490, 262, { size: 9, color: '#6a6a78', align: 'right', alpha: 0.5 + Math.sin(G.time * 5) * 0.5 });
    }
    return;
  }
  if (d.type === 'panel') {
    const { bx, by, y0 } = panelBox(ctx, d);
    const startIdx = Math.floor(d.scroll / 24);
    const vis = Math.min(d.items.length - startIdx, 9);
    for (let i = 0; i < vis; i++) {
      const idx = startIdx + i;
      const it = d.items[idx];
      const y = y0 + i * 24;
      const hov = d.hover === idx;
      if (hov) {
        ctx.fillStyle = 'rgba(232,193,85,0.12)';
        ctx.fillRect(bx + 4, y, d.w - 8, 22);
      }
      const label = hov && !it.disabled ? '▸ ' + it.label : '  ' + it.label;
      text(ctx, label.slice(0, 26), bx + 10, y + 5, { size: 10, color: it.disabled ? '#5a5a68' : (it.color || (hov ? '#e8e2d0' : '#c9c9c9')), bold: hov });
      if (it.right) text(ctx, it.right, bx + d.w - 10, y + 5, { size: 10, color: it.disabled ? '#5a5a68' : '#e8b84a', align: 'right' });
    }
    // 描述区
    const hovIt = d.items[d.hover];
    if (d.hint || (hovIt && hovIt.sub)) {
      const desc = hovIt && hovIt.sub ? hovIt.sub : d.hint;
      ctx.fillStyle = '#14141a';
      ctx.fillRect(bx + 1, by + 44 + 9 * 24 - 8, d.w - 2, 32);
      const lines = wrapText(ctx, desc, d.w - 20, 9).slice(0, 2);
      lines.forEach((l, i) => text(ctx, l, bx + 10, by + 44 + 9 * 24 - 2 + i * 12, { size: 9, color: '#8a8a98' }));
    }
    if (d.items.length > 9) {
      const p = d.scroll / Math.max(1, d.items.length * 24 - 190);
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(bx + d.w - 4, y0, 2, 9 * 24);
      ctx.fillStyle = '#8a8a98';
      ctx.fillRect(bx + d.w - 4, y0 + p * (9 * 24 - 30), 2, 30);
    }
  }
}
