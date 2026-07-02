// ---------------------------------------------------------------
// WebAudio による効果音 (外部ファイルなし, その場で合成)
// ---------------------------------------------------------------
"use strict";

class Sound {
  constructor() {
    this.ctx = null;
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
