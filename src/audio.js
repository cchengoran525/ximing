// WebAudio 程序合成音效 + 芯片音背景乐（无任何音频文件）
import { G } from './state.js';

let AC = null, master = null, musicGain = null, sfxGain = null;
export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.gain.value = 0.8; master.connect(AC.destination);
  sfxGain = AC.createGain(); sfxGain.connect(master);
  musicGain = AC.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
  applyVolumes();
  startMusicLoop();
}

export function applyVolumes() {
  if (!AC) return;
  const s = G.meta ? G.meta.sound : { music: 1, sfx: 1 };
  sfxGain.gain.value = s.sfx ? 0.9 : 0;
  musicGain.gain.value = s.music ? 0.42 : 0;
}

function noiseBuf(dur = 0.3) {
  const n = Math.floor(AC.sampleRate * dur);
  const buf = AC.createBuffer(1, n, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function env(g, t, a, d, peak = 1) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type, f0, f1, t, a, d, peak = 0.5, dest = null) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + a + d);
  env(g, t, a, d, peak);
  o.connect(g); g.connect(dest || sfxGain);
  o.start(t); o.stop(t + a + d + 0.02);
}

function noise(t, dur, peak = 0.4, filterFreq = 0, filterQ = 1) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf(dur + 0.05);
  const g = AC.createGain(); env(g, t, 0.004, dur, peak);
  let node = src;
  if (filterFreq) {
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq; f.Q.value = filterQ;
    src.connect(f); node = f;
  }
  node.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + dur + 0.1);
}

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export function sfx(name, p = 1) {
  if (!AC || !(G.meta ? G.meta.sound.sfx : 1)) return;
  const t = AC.currentTime + 0.001;
  switch (name) {
    case 'shoot': tone('square', 880 * p, 220 * p, t, 0.002, 0.08, 0.16); break;
    case 'shoot_big': tone('sawtooth', 300 * p, 80, t, 0.003, 0.16, 0.25); noise(t, 0.08, 0.12, 1800); break;
    case 'shotgun': noise(t, 0.18, 0.5, 2400); tone('square', 160, 60, t, 0.002, 0.12, 0.3); break;
    case 'laser': tone('sawtooth', 1400 * p, 3200 * p, t, 0.005, 0.1, 0.14); break;
    case 'flame': noise(t, 0.12, 0.14, 900); break;
    case 'boom': noise(t, 0.5, 0.7, 700); tone('sine', 120, 30, t, 0.005, 0.4, 0.5); break;
    case 'hit': noise(t, 0.06, 0.25, 3000); break;
    case 'hit_hard': noise(t, 0.1, 0.4, 1600); tone('square', 220, 90, t, 0.002, 0.08, 0.2); break;
    case 'die': tone('sawtooth', 300, 40, t, 0.005, 0.25, 0.3); noise(t + 0.02, 0.15, 0.2, 1200); break;
    case 'hurt': tone('square', 190, 70, t, 0.004, 0.22, 0.4); noise(t, 0.1, 0.2, 900); break;
    case 'dash': noise(t, 0.14, 0.2, 5200); break;
    case 'pickup': tone('sine', 660, 660, t, 0.004, 0.06, 0.25); tone('sine', 990, 990, t + 0.06, 0.004, 0.09, 0.25); break;
    case 'parts': tone('square', 1300, 1300, t, 0.002, 0.04, 0.12); tone('square', 1700, 1700, t + 0.04, 0.002, 0.05, 0.12); break;
    case 'heal': tone('sine', 520, 780, t, 0.02, 0.25, 0.3); tone('sine', 660, 990, t + 0.08, 0.02, 0.25, 0.2); break;
    case 'door': noise(t, 0.25, 0.35, 500); tone('square', 90, 60, t, 0.01, 0.2, 0.25); break;
    case 'chest': [0, 4, 7, 12].forEach((n, i) => tone('square', mtof(76 + n), 0, t + i * 0.07, 0.005, 0.12, 0.18)); break;
    case 'ui': tone('square', 950, 950, t, 0.002, 0.045, 0.12); break;
    case 'ui_back': tone('square', 500, 350, t, 0.002, 0.07, 0.12); break;
    case 'buy': tone('square', 880, 880, t, 0.002, 0.06, 0.2); tone('square', 1320, 1320, t + 0.07, 0.002, 0.09, 0.2); break;
    case 'deny': tone('square', 220, 160, t, 0.004, 0.14, 0.25); break;
    case 'teleport': tone('sine', 300, 1500, t, 0.05, 0.35, 0.25); tone('sine', 450, 2250, t + 0.05, 0.05, 0.3, 0.15); break;
    case 'alarm': [0, 0.3].forEach(dt => tone('sawtooth', 440, 660, t + dt, 0.02, 0.25, 0.3)); break;
    case 'thunder': noise(t, 0.7, 0.5, 300); break;
    case 'static': noise(t, 0.35, 0.22, 4000); break;
    case 'revive': [0, 5, 9].forEach((n, i) => tone('triangle', mtof(69 + n), 0, t + i * 0.09, 0.01, 0.2, 0.25)); break;
    case 'bite': noise(t, 0.08, 0.35, 2200); tone('square', 300, 120, t, 0.002, 0.09, 0.25); break;
    case 'charge': tone('sawtooth', 80, 260, t, 0.1, 0.4, 0.3); break;
  }
}

// ---------------- 音乐（简易步进音序器） ----------------
// mel/bass: 长度 64 的数组（8 小节 × 8 步），值 = MIDI 音高或 0；drum: 1 底鼓 2 军鼓 3 hihat
const SONGS = {
  title: { bpm: 84, mel: SONG_TITLE_MEL, bass: SONG_TITLE_BASS, drum: null },
  hub:   { bpm: 92, mel: SONG_HUB_MEL, bass: SONG_HUB_BASS, drum: null },
  indoor:{ bpm: 108, mel: SONG_INDOOR_MEL, bass: SONG_INDOOR_BASS, drum: SONG_INDOOR_DRUM },
  street:{ bpm: 116, mel: SONG_STREET_MEL, bass: SONG_STREET_BASS, drum: SONG_STREET_DRUM },
  highway:{ bpm: 124, mel: SONG_HIGHWAY_MEL, bass: SONG_HIGHWAY_BASS, drum: SONG_HIGHWAY_DRUM },
  boss:  { bpm: 140, mel: SONG_BOSS_MEL, bass: SONG_BOSS_BASS, drum: SONG_BOSS_DRUM },
  rest:  { bpm: 80, mel: SONG_REST_MEL, bass: SONG_REST_BASS, drum: null },
};
const z = n => new Array(n).fill(0);

function SONG_TITLE_MEL() { return [69,0,72,0,74,0,72,0, 69,0,0,67,69,0,0,0, 65,0,69,0,72,0,0,0, 0,0,0,0,0,0,0,0]; }
function SONG_TITLE_BASS() { return [45,0,0,0,45,0,0,0, 41,0,0,0,41,0,0,0, 43,0,0,0,43,0,0,0, 40,0,0,0,0,0,0,0]; }
function SONG_HUB_MEL() { return [72,0,0,76,0,0,74,0, 72,0,0,0,0,0,0,0, 69,0,0,72,0,0,71,0, 69,0,0,0,0,0,0,0]; }
function SONG_HUB_BASS() { return [48,0,0,0,43,0,0,0, 45,0,0,0,40,0,0,0]; }
function SONG_INDOOR_MEL() { return [69,0,72,74,0,72,0,69, 67,0,69,0,72,0,0,0, 69,0,72,74,0,76,0,74, 72,0,0,0,0,0,0,0]; }
function SONG_INDOOR_BASS() { return [45,45,0,45,0,45,52,0, 41,41,0,41,0,41,48,0]; }
function SONG_INDOOR_DRUM() { return [1,0,3,0,2,0,3,3, 1,0,3,0,2,0,3,0]; }
function SONG_STREET_MEL() { return [67,0,70,0,72,0,70,67, 65,0,67,0,0,0,0,0, 67,0,70,0,74,0,72,70, 67,0,0,0,0,0,0,0]; }
function SONG_STREET_BASS() { return [43,0,43,0,46,0,43,0, 41,0,41,0,48,0,41,0]; }
function SONG_STREET_DRUM() { return [1,0,3,2,1,0,3,2, 1,0,3,2,1,3,2,3]; }
function SONG_HIGHWAY_MEL() { return [64,0,64,67,0,69,0,0, 71,0,69,0,67,0,64,0, 64,0,64,67,0,69,0,71, 69,0,0,0,0,0,0,0]; }
function SONG_HIGHWAY_BASS() { return [40,0,40,40,0,40,45,0, 38,0,38,38,0,38,43,0]; }
function SONG_HIGHWAY_DRUM() { return [1,0,3,0,2,0,3,0, 1,0,3,0,2,3,3,0]; }
function SONG_BOSS_MEL() { return [69,69,0,72,0,69,74,0, 72,0,71,0,72,0,74,76, 69,69,0,72,0,69,74,0, 77,0,76,0,74,0,72,0]; }
function SONG_BOSS_BASS() { return [45,45,45,0,45,0,44,0, 41,41,41,0,41,0,40,0]; }
function SONG_BOSS_DRUM() { return [1,0,2,1,0,2,1,2, 1,0,2,1,0,2,3,3]; }
function SONG_REST_MEL() { return [76,0,0,0,74,0,0,0, 72,0,0,0,0,0,0,0, 74,0,0,0,72,0,0,0, 69,0,0,0,0,0,0,0]; }
function SONG_REST_BASS() { return [45,0,0,0,41,0,0,0, 43,0,0,0,40,0,0,0]; }

// 展开为 64 步（不足则循环填充）
function expand(arr, len = 64) {
  const out = new Array(len).fill(0);
  for (let i = 0; i < len; i++) out[i] = arr[i % arr.length];
  return out;
}

let curSong = null, step = 0, nextTime = 0, timerId = null;

export function setSong(name) {
  if (curSong === name) return;
  curSong = name;
  step = 0;
  if (AC) nextTime = AC.currentTime + 0.05;
}

function startMusicLoop() {
  nextTime = AC.currentTime + 0.1;
  timerId = setInterval(() => {
    if (!AC || !curSong) return;
    const song = SONGS[curSong];
    if (!song) return;
    const spb = 60 / song.bpm / 2; // 8分音符
    while (nextTime < AC.currentTime + 0.25) {
      const mel = expand(song.mel), bass = expand(song.bass);
      const m = mel[step % 64], b = bass[step % 64];
      if (m) tone('square', mtof(m), 0, nextTime, 0.01, spb * 0.9, 0.12, musicGain);
      if (b) tone('triangle', mtof(b - 12), 0, nextTime, 0.01, spb * 1.4, 0.2, musicGain);
      if (song.drum) {
        const d = expand(song.drum)[step % 64];
        if (d === 1) { tone('sine', 130, 45, nextTime, 0.002, 0.12, 0.5, musicGain); }
        else if (d === 2) {
          const src = AC.createBufferSource(); src.buffer = noiseBuf(0.09);
          const g = AC.createGain(); env(g, nextTime, 0.002, 0.08, 0.22);
          src.connect(g); g.connect(musicGain); src.start(nextTime); src.stop(nextTime + 0.15);
        } else if (d === 3) {
          const src = AC.createBufferSource(); src.buffer = noiseBuf(0.04);
          const g = AC.createGain(); env(g, nextTime, 0.001, 0.03, 0.08);
          const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
          src.connect(f); f.connect(g); g.connect(musicGain); src.start(nextTime); src.stop(nextTime + 0.06);
        }
      }
      nextTime += spb;
      step++;
    }
  }, 90);
}
