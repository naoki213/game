// ---------------------------------------------------------------
// WebAudio による効果音 (外部ファイルなし, その場で合成)
// ---------------------------------------------------------------
"use strict";

class Sound {
  constructor() {
    this.ctx = null;
    this.musicTimer = null;
    this.musicGain = null;
  }

  // ブラウザの自動再生制限のため, 最初のユーザー操作後に初期化する
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  // 短いノイズバースト (破壊音)
  break_() {
    const ctx = this.ensure();
    if (!ctx) return;
    const dur = 0.12;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  // コッ という短い音 (設置音)
  place() {
    this.blip(320, 0.07, "square", 0.18);
  }

  // 足音的なアクセント (ジャンプ着地)
  thud() {
    this.blip(140, 0.08, "sine", 0.22);
  }

  // ---------------- 環境 BGM (生成) ----------------

  // M キーでトグル。ペンタトニックの穏やかなアルペジオ
  toggleMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
      if (this.musicGain) {
        this.musicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1);
      }
      return false;
    }
    const ctx = this.ensure();
    if (!ctx) return false;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.05;
    this.musicGain.connect(ctx.destination);

    // C メジャーペンタトニック 2 オクターブ
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0,
                   523.25, 587.33, 659.25, 784.0, 880.0];

    const playNote = (freq, when, dur, vol) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      osc.connect(g).connect(this.musicGain);
      osc.start(when);
      osc.stop(when + dur + 0.1);
    };

    const bar = () => {
      const t0 = ctx.currentTime + 0.05;
      // ゆったりしたアルペジオ 3–5 音
      const n = 3 + (Math.random() * 3) | 0;
      let idx = (Math.random() * scale.length) | 0;
      for (let i = 0; i < n; i++) {
        idx = Math.max(0, Math.min(scale.length - 1,
          idx + ((Math.random() * 5) | 0) - 2));
        playNote(scale[idx], t0 + i * (0.55 + Math.random() * 0.25), 2.2, 0.8);
      }
      // 低音ドローン
      if (Math.random() < 0.5) {
        playNote(scale[0] / 2, t0, 3.5, 0.5);
      }
    };

    bar();
    this.musicTimer = setInterval(bar, 3600);
    return true;
  }

  blip(freq, dur, type, vol) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }
}
