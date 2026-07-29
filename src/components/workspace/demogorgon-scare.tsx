"use client";

// The demogorgon on your screen. Renders above everything, blooms open with a
// screech, holds long enough to land, then lets the victim close it — which
// marks the notification read so it doesn't loop.

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { paintDemogorgon } from "./sprites";

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

  // The bloom: petals open over ~1.2s, then the head sways.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 440;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - start) / 1000;
      const open = Math.min(1, elapsed / 1.2);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate(Math.sin(elapsed * 2.2) * 0.03);
      ctx.translate(-size / 2, -size / 2);
      paintDemogorgon(ctx, size, open);
      ctx.restore();
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
      <canvas
        ref={canvasRef}
        className="relative"
        style={{ width: 440, height: 440, animation: "demogorgon-shake 0.09s infinite" }}
      />
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
      <style>{`@keyframes demogorgon-shake {
        0% { transform: translate(0.6px, -0.8px); }
        50% { transform: translate(-0.8px, 0.6px); }
        100% { transform: translate(0.5px, 0.7px); }
      }`}</style>
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

let scareAudio: AudioContext | null = null;
function screech() {
  try {
    scareAudio = scareAudio ?? new AudioContext();
    const t = scareAudio.currentTime;
    // A descending growl + noise burst — unpleasant, brief, effective.
    const osc = scareAudio.createOscillator();
    const oscGain = scareAudio.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 1.5);
    oscGain.gain.setValueAtTime(0.0001, t);
    oscGain.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    osc.connect(oscGain).connect(scareAudio.destination);
    osc.start(t);
    osc.stop(t + 2);

    const bufferLen = Math.floor(scareAudio.sampleRate * 0.9);
    const buffer = scareAudio.createBuffer(1, bufferLen, scareAudio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferLen);
    const noise = scareAudio.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = scareAudio.createGain();
    noiseGain.gain.setValueAtTime(0.09, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    const filter = scareAudio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    noise.connect(filter).connect(noiseGain).connect(scareAudio.destination);
    noise.start(t);
  } catch {
    // No audio permission — the visual still lands.
  }
}
