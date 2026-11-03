import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const FFMPEG = "D:/Claude code programe/VOZEB-PRO/LocalMiniDrama/backend-node/tools/ffmpeg/ffmpeg.exe";
const SR = 11025;
const HOP = 110; // ~10ms
const files = process.argv.slice(2);

for (const file of files) {
    const r = spawnSync(FFMPEG, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], { maxBuffer: 1 << 30 });
    const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length >> 1);
    const n = Math.floor(pcm.length / HOP);
    const rms = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < HOP; j++) { const v = pcm[i * HOP + j] / 32768; s += v * v; }
        rms[i] = Math.sqrt(s / HOP);
    }
    const onset = new Float32Array(n);
    for (let i = 1; i < n; i++) onset[i] = Math.max(0, rms[i] - rms[i - 1]);
    const fps = SR / HOP;
    let best = { bpm: 0, score: -1 };
    for (let bpm = 80; bpm <= 170; bpm += 0.5) {
        const lag = (60 / bpm) * fps;
        let s = 0;
        for (let i = 0; i + lag * 4 < n; i++) {
            const a = onset[i];
            s += a * (onset[Math.round(i + lag)] + 0.5 * onset[Math.round(i + 2 * lag)] + 0.25 * onset[Math.round(i + 4 * lag)]);
        }
        if (s > best.score) best = { bpm, score: s };
    }
    const period = (60 / best.bpm) * fps;
    let bestPhase = 0, bestSum = -1;
    for (let ph = 0; ph < period; ph++) {
        let s = 0;
        for (let k = ph; k < n; k += period) s += onset[Math.round(k)];
        if (s > bestSum) { bestSum = s; bestPhase = ph; }
    }
    const secs = n / fps;
    const bins = [];
    for (let t = 0; t < secs; t += 4) {
        let s = 0, c = 0;
        for (let i = Math.floor(t * fps); i < Math.min(n, (t + 4) * fps); i++) { s += rms[i]; c++; }
        bins.push((s / c).toFixed(3));
    }
    const beats = [];
    for (let k = bestPhase; k < n; k += period) beats.push(+(k / fps).toFixed(3));
    console.log(`${file}\n  dur=${secs.toFixed(1)}s bpm=${best.bpm} firstBeat=${(bestPhase / fps).toFixed(3)}s\n  rms/4s: ${bins.join(" ")}`);
    writeFileSync(file.replace(/\.mp3$/, ".beats.json"), JSON.stringify({ bpm: best.bpm, beats, rms4s: bins.map(Number) }));
}
