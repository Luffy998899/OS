"use client";

// The demogorgon on your screen. Renders above everything, blooms open with a
// screech, LUNGES at the viewer with a second harsher stinger and a red
// flash, then settles into a breathing loom until the victim closes it —
// which marks the notification read so it doesn't loop.

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";

// Timeline (seconds from mount): bloom, then the lunge, then the loom.
const BLOOM_DUR = 1.2;
const LUNGE_AT = 1.35;
const LUNGE_DUR = 0.3;
const LUNGE_END = LUNGE_AT + LUNGE_DUR;
const SETTLE_END = LUNGE_END + 0.55;
const LUNGE_SCALE = 2.9;
const REST_SCALE = 1.55;
const BASE_SHAKE = 0.8;

export function DemogorgonScare({
  notifId,
  body,
  onDone,
}: {
  notifId: string;
  body: string | null;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const [dismissable, setDismissable] = useState(false);
  const utils = trpc.useUtils();
  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.workspace.state.invalidate();
      utils.workspace.myScare.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  useEffect(() => {
    screech();
    const t = setTimeout(() => setDismissable(true), 2600);
    return () => clearTimeout(t);
  }, []);

  // The bloom, the lunge, the loom — one elapsed-driven rAF loop paints the
  // head and drives the wrapper transform + flash overlay directly.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const flash = flashRef.current;
    if (!canvas || !wrap || !flash) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 440;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let lungeFired = false;
    const start = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - start) / 1000;
      const open = Math.min(1, elapsed / BLOOM_DUR);

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(Math.sin(elapsed * 2.2) * 0.03);
      ctx.translate(-size / 2, -size / 2);
      paintDemogorgon(ctx, size, open);
      ctx.restore();

      let scale = 1;
      let shakeAmp = BASE_SHAKE;
      let flashOpacity = 0;
      if (elapsed >= LUNGE_AT) {
        if (!lungeFired) {
          lungeFired = true;
          lungeScreech();
        }
        if (elapsed < LUNGE_END) {
          // Ease-in cubic: it accelerates INTO your face.
          const p = (elapsed - LUNGE_AT) / LUNGE_DUR;
          scale = 1 + (LUNGE_SCALE - 1) * p * p * p;
          shakeAmp = BASE_SHAKE * 3;
        } else if (elapsed < SETTLE_END) {
          const p = (elapsed - LUNGE_END) / (SETTLE_END - LUNGE_END);
          const e = 1 - Math.pow(1 - p, 3);
          scale = LUNGE_SCALE + (REST_SCALE - LUNGE_SCALE) * e;
          shakeAmp = BASE_SHAKE * 3 + (BASE_SHAKE - BASE_SHAKE * 3) * e;
        } else {
          // Breathing: subtle 1.5% scale oscillation, ~3s cycle.
          scale = REST_SCALE * (1 + 0.015 * Math.sin((elapsed - SETTLE_END) * 2.1));
        }
        flashOpacity = Math.max(0, 0.5 * (1 - (elapsed - LUNGE_AT) / 0.4));
      }
      const sx = Math.sin(elapsed * 87) * shakeAmp;
      const sy = Math.cos(elapsed * 113) * shakeAmp;
      wrap.style.transform = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px) scale(${scale.toFixed(4)})`;
      flash.style.opacity = flashOpacity.toFixed(3);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = () => {
    markRead.mutate({ id: notifId });
    onDone();
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(ellipse at center, #1a060d 0%, #05020a 78%)" }}
      onClick={() => dismissable && close()}
    >
      {/* Drifting spores */}
      <Spores />
      {/* Red vignette pulse */}
      <div
        className="pointer-events-none absolute inset-0 animate-pulse"
        style={{ boxShadow: "inset 0 0 180px 60px rgba(125,30,48,0.55)" }}
      />
      <div ref={wrapRef} className="relative" style={{ willChange: "transform" }}>
        <canvas ref={canvasRef} style={{ width: 440, height: 440 }} />
      </div>
      <p className="relative mt-2 font-mono text-sm tracking-[0.3em] text-[#ff8f85] uppercase">
        The Upside Down is watching
      </p>
      <p className="relative mt-1 max-w-md px-6 text-center text-xs text-[#c9a6a0]">
        {body ?? "Someone noticed the slack. Back to work before it crawls out again."}
      </p>
      {dismissable ? (
        <button
          onClick={close}
          className="relative mt-5 rounded-full border border-[#7d1e30] px-4 py-1.5 font-mono text-[0.65rem] tracking-widest text-[#ff8f85] uppercase transition-colors hover:bg-[#7d1e30]/30"
        >
          I&apos;m working, I&apos;m working
        </button>
      ) : null}
      {/* Red flash — fires with the lunge, driven from the rAF loop */}
      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0"
        style={{ background: "#ff1f1f", opacity: 0 }}
      />
    </div>
  );
}

function Spores() {
  // Fixed pseudo-random spores; CSS animates the drift.
  const spores = Array.from({ length: 26 }, (_, i) => ({
    left: `${(i * 37 + 11) % 100}%`,
    top: `${(i * 53 + 23) % 100}%`,
    size: 2 + ((i * 7) % 4),
    delay: `${(i % 9) * 0.7}s`,
    duration: `${6 + (i % 5)}s`,
  }));
  return (
    <>
      {spores.map((s, i) => (
        <span
          key={i}
          className="pointer-events-none absolute rounded-full bg-[#c9a6a0]/40"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animation: `spore-drift ${s.duration} linear ${s.delay} infinite`,
          }}
        />
      ))}
      <style>{`@keyframes spore-drift {
        from { transform: translateY(0) translateX(0); opacity: 0.7; }
        to { transform: translateY(-120px) translateX(24px); opacity: 0; }
      }`}</style>
    </>
  );
}

/**
 * The demogorgon, painted straight onto the jumpscare canvas: a petal-head
 * opening around a dark maw, teeth ringing every petal. `t` in [0,1] opens the
 * flower — the scare animates it from closed to fully open.
 */
function paintDemogorgon(ctx: CanvasRenderingContext2D, size: number, t: number) {
  const cx = size / 2;
  const cy = size / 2;
  const open = 0.25 + 0.75 * t;
  ctx.save();
  ctx.translate(cx, cy);

  // Neck / body silhouette
  ctx.fillStyle = "#12080c";
  ctx.beginPath();
  ctx.moveTo(-size * 0.16, size * 0.5);
  ctx.quadraticCurveTo(-size * 0.1, size * 0.1, 0, size * 0.06);
  ctx.quadraticCurveTo(size * 0.1, size * 0.1, size * 0.16, size * 0.5);
  ctx.closePath();
  ctx.fill();

  // Petals
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.rotate(a);
    const reach = size * 0.34 * open;
    const width = size * 0.19;
    const grad = ctx.createLinearGradient(0, 0, 0, -reach);
    grad.addColorStop(0, "#5c1620");
    grad.addColorStop(0.55, "#8a2430");
    grad.addColorStop(1, "#c9705c");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-width * 0.32, -size * 0.04);
    ctx.quadraticCurveTo(-width, -reach * 0.55, -width * 0.28, -reach);
    ctx.quadraticCurveTo(0, -reach * 1.12, width * 0.28, -reach);
    ctx.quadraticCurveTo(width, -reach * 0.55, width * 0.32, -size * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2b0a10";
    ctx.lineWidth = size * 0.012;
    ctx.stroke();
    // Teeth along the petal's inner edges
    ctx.fillStyle = "#f2e6d2";
    const rows = 5;
    for (let r = 1; r <= rows; r++) {
      const yy = -(reach * r) / (rows + 1);
      const w2 = width * (0.85 - 0.1 * r);
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sgn * w2 * 0.55, yy);
        ctx.lineTo(sgn * (w2 * 0.55 - size * 0.014), yy + size * 0.02);
        ctx.lineTo(sgn * (w2 * 0.55 - size * 0.028), yy - size * 0.004);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // The maw
  const mawR = size * 0.11 * (0.7 + 0.3 * t);
  const maw = ctx.createRadialGradient(0, 0, mawR * 0.1, 0, 0, mawR);
  maw.addColorStop(0, "#050203");
  maw.addColorStop(0.7, "#1c060b");
  maw.addColorStop(1, "#4a1019");
  ctx.fillStyle = maw;
  ctx.beginPath();
  ctx.arc(0, 0, mawR, 0, Math.PI * 2);
  ctx.fill();
  // Inner teeth ring
  ctx.fillStyle = "#e8d9c2";
  const inner = 14;
  for (let i = 0; i < inner; i++) {
    const a = (i / inner) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -mawR * 0.95);
    ctx.lineTo(-size * 0.008, -mawR * 0.7);
    ctx.lineTo(size * 0.008, -mawR * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

let scareAudio: AudioContext | null = null;

function burst(o: {
  freqFrom: number;
  freqTo: number;
  sweepDur: number;
  oscPeak: number;
  noisePeak: number;
  noiseDur: number;
  filterFreq: number;
}) {
  try {
    scareAudio = scareAudio ?? new AudioContext();
    const t = scareAudio.currentTime;
    // A descending growl + noise burst — unpleasant, brief, effective.
    const osc = scareAudio.createOscillator();
    const oscGain = scareAudio.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(o.freqFrom, t);
    osc.frequency.exponentialRampToValueAtTime(o.freqTo, t + o.sweepDur);
    oscGain.gain.setValueAtTime(0.0001, t);
    oscGain.gain.exponentialRampToValueAtTime(o.oscPeak, t + 0.08);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + o.sweepDur + 0.4);
    osc.connect(oscGain).connect(scareAudio.destination);
    osc.start(t);
    osc.stop(t + o.sweepDur + 0.5);

    const bufferLen = Math.floor(scareAudio.sampleRate * o.noiseDur);
    const buffer = scareAudio.createBuffer(1, bufferLen, scareAudio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferLen);
    const noise = scareAudio.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = scareAudio.createGain();
    noiseGain.gain.setValueAtTime(o.noisePeak, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + o.noiseDur);
    const filter = scareAudio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = o.filterFreq;
    noise.connect(filter).connect(noiseGain).connect(scareAudio.destination);
    noise.start(t);
  } catch {
    // No audio permission — the visual still lands.
  }
}

function screech() {
  burst({
    freqFrom: 190,
    freqTo: 46,
    sweepDur: 1.5,
    oscPeak: 0.16,
    noisePeak: 0.09,
    noiseDur: 0.9,
    filterFreq: 900,
  });
}

/** The lunge stinger: faster sweep, higher noise band, slightly louder. */
function lungeScreech() {
  burst({
    freqFrom: 320,
    freqTo: 60,
    sweepDur: 0.35,
    oscPeak: 0.22,
    noisePeak: 0.16,
    noiseDur: 0.5,
    filterFreq: 1600,
  });
}
