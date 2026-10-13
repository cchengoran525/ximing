// 全局共享状态（单例，避免循环依赖）
export const G = {
  scene: null,          // 当前场景对象 {enter,update,render}
  sceneName: 'boot',
  time: 0,
  frame: 0,
  shake: 0,             // 屏幕震动强度
  meta: null,           // 存档数据
  run: null,            // 当前 run 状态（肉鸽局内）
  player: null,         // 玩家（跨房间持续）
  room: null,           // 当前地图（整层大地图 / 小屋）
  region: null,         // 当前所在区域
  cam: { x: 0, y: 0 },  // 摄像机（世界像素，左上角）
  mworld: { x: 0, y: 0 }, // 鼠标的世界坐标
  bullets: [],          // 当前地图子弹
  particles: [],
  zones: [],            // 火焰等持续伤害区域
  telegraphs: [],       // 落点预警
  hint: null,           // 交互提示 {x,y,str}
  decoy: null,          // 诱饵（吸引敌人）
  dialog: null,         // 打开的对话框/面板（打开时暂停游戏逻辑）
  toasts: [],
  fade: null,           // {t, dur, mid, done} 转场
  debug: new URLSearchParams(location.search).has('debug'),
  god: false,
};

export function setScene(name, scene, params) {
  G.sceneName = name;
  G.scene = scene;
  G.dialog = null;
  scene.enter && scene.enter(params);
}

export function toast(text, color = '#e8e2d0') {
  G.toasts.push({ text, color, t: 2.6 });
  if (G.toasts.length > 4) G.toasts.shift();
}

// 转场：t 从 0→dur，中点执行 mid()
export function startFade(dur, mid, done) {
  G.fade = { t: 0, dur, mid, done };
}

export function shake(n) { G.shake = Math.max(G.shake, n); }
