// 成就：满足条件自动达成并奖励零件（meta.checkAchievements 里结算）
import { WEAPONS } from './data_weapons.js';

const UNLOCKABLE_WEAPONS = Object.values(WEAPONS).filter(w => w.price > 0).length;
const TOTAL_NOTES = 9;

export const ACHIEVEMENTS = [
  { id: 'first_run', name: '第一次出门', desc: '完成一次出击', reward: 20, check: m => m.stats.runs >= 1 },
  { id: 'first_win', name: '穿过三声枪响', desc: '通关一次', reward: 60, check: m => m.stats.wins >= 1 },
  { id: 'wins3', name: '常客', desc: '累计通关 3 次', reward: 120, check: m => m.stats.wins >= 3 },
  { id: 'kills100', name: '街区清道夫', desc: '累计击杀 100 个敌人', reward: 40, check: m => m.stats.kills >= 100 },
  { id: 'kills500', name: '雨中人', desc: '累计击杀 500 个敌人', reward: 120, check: m => m.stats.kills >= 500 },
  { id: 'boss10', name: '拆招牌的人', desc: '击败区域 Boss 累计 10 次', reward: 100, check: m => (m.stats.bosses || 0) >= 10 },
  { id: 'elites20', name: '精英猎手', desc: '击败精英敌人 20 个', reward: 80, check: m => (m.stats.elites || 0) >= 20 },
  { id: 'smith10', name: '铁匠', desc: '完成 10 次武器合成', reward: 80, check: m => (m.stats.combos || 0) >= 10 },
  { id: 'arsenal', name: '军火库', desc: '解锁全部可解锁武器', reward: 150, check: m => m.weapons.length >= UNLOCKABLE_WEAPONS },
  { id: 'archivist', name: '档案管理员', desc: '集齐所有城市档案', reward: 120, check: m => m.notes.length >= TOTAL_NOTES },
  { id: 'qi_pal', name: '同路人', desc: '带着齐青通关一次', reward: 100, check: m => !!m.flags.qiWin },
  { id: 'contract5', name: '接单的人', desc: '累计完成 5 张通缉契约', reward: 90, check: m => (m.stats.contracts || 0) >= 5 },
];

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;
