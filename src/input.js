// 输入：键盘 + 鼠标。canvas 逻辑分辨率 512x288。
export const Input = {
  keys: new Set(),
  pressed: new Set(),   // 本帧刚按下
  mx: 256, my: 144,
  mdown: false,          // 鼠标左键按住
  mpressed: false,       // 本帧刚按下
  anyPressed: false,

  init(canvas) {
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.anyPressed = true;
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    const toLocal = e => {
      const r = canvas.getBoundingClientRect();
      this.mx = (e.clientX - r.left) / r.width * 512;
      this.my = (e.clientY - r.top) / r.height * 288;
    };
    canvas.addEventListener('mousemove', toLocal);
    canvas.addEventListener('mousedown', e => { toLocal(e); if (e.button === 0) { this.mdown = true; this.mpressed = true; } });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mdown = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { this.keys.clear(); this.mdown = false; });
  },

  updateFrame() {
    this.pressed.clear();
    this.mpressed = false;
    this.anyPressed = false;
  },

  just(code) { return this.pressed.has(code); },
  down(...codes) { return codes.some(c => this.keys.has(c)); },

  axis() {
    let x = 0, y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y -= 1;
    if (this.down('KeyS', 'ArrowDown')) y += 1;
    if (x && y) { x *= 0.7071; y *= 0.7071; }
    return { x, y };
  },
};
