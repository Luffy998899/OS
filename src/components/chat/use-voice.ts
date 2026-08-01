"use client";

// Voice channels, Discord style: join a channel and you are in a full mesh with
// everyone else already in it. There is no media server — each pair holds its
// own RTCPeerConnection and the handshake travels through tRPC as a mailbox
// (chat.voiceSignal writes, chat.voicePoll drains). That is plenty for the
// handful of people a room channel actually holds.
//
// Ownership rules that keep the mesh from tearing itself apart:
//   * one side offers, decided by id order (isVoiceInitiator), so no glare;
//   * presence is a heartbeat — a tab that dies goes stale and is swept;
//   * every peer connection is closed on leave, unmount and page hide.

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { VOICE_HEARTBEAT_MS, isVoiceInitiator } from "@/lib/chat";

const SIGNAL_POLL_MS = 1000;
const STATE_POLL_MS = 3000;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type VoiceMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  muted: boolean;
  deafened: boolean;
  isMe: boolean;
};

type Peer = {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  /** Candidates that arrived before the remote description was set. */
  pending: RTCIceCandidateInit[];
};

export type VoiceSession = {
  channelId: string | null;
  connecting: boolean;
  error: string | null;
  muted: boolean;
  deafened: boolean;
  /** Ids of peers whose audio is above the speaking threshold right now. */
  speaking: Set<string>;
  join: (channelId: string) => void;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
};

export function useVoice(myId: string): VoiceSession {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const join = trpc.chat.voiceJoin.useMutation();
  const leaveCall = trpc.chat.voiceLeave.useMutation();
  const signal = trpc.chat.voiceSignal.useMutation();
  const poll = trpc.chat.voicePoll.useMutation();
  const utils = trpc.useUtils();

  // Everything the async loops touch lives in refs — this is a long-lived
  // connection, not render state.
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const channelRef = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Mutation handles are recreated every render; the loops below must not
  // restart when that happens.
  const api = useRef({ join, leaveCall, signal, poll, utils });
  api.current = { join, leaveCall, signal, poll, utils };

  /** Tear a single peer down. */
  const dropPeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
    peersRef.current.delete(peerId);
    analysersRef.current.delete(peerId);
  }, []);

  /** Tear the whole session down: peers, mic, timers. */
  const teardown = useCallback(() => {
    for (const id of [...peersRef.current.keys()]) dropPeer(id);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analysersRef.current.clear();
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    channelRef.current = null;
    setSpeaking(new Set());
  }, [dropPeer]);

  /** Watch one stream's level so the UI can ring the speaker's avatar. */
  const watchLevel = useCallback((peerId: string, stream: MediaStream) => {
    try {
      audioCtxRef.current =
        audioCtxRef.current ??
        new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analysersRef.current.set(peerId, analyser);
    } catch {
      /* level metering is cosmetic — never break the call over it */
    }
  }, []);

  /** Build (or fetch) the connection to one peer. */
  const peerFor = useCallback(
    (peerId: string, channel: string): Peer => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      // The sink has to be in the document: a detached <audio> is not
      // guaranteed to play, and nothing can inspect it either.
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.dataset.voicePeer = peerId;
      audio.style.display = "none";
      document.body.appendChild(audio);
      const peer: Peer = { pc, audio, pending: [] };
      peersRef.current.set(peerId, peer);

      for (const track of streamRef.current?.getTracks() ?? []) {
        pc.addTrack(track, streamRef.current!);
      }

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        api.current.signal.mutate({
          channelId: channel,
          toUserId: peerId,
          kind: "ice",
          payload: JSON.stringify(e.candidate.toJSON()),
        });
      };
      pc.ontrack = (e) => {
        const [remote] = e.streams;
        if (!remote) return;
        audio.srcObject = remote;
        audio.muted = deafenedRef.current;
        void audio.play().catch(() => {});
        watchLevel(peerId, remote);
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(pc.connectionState)) dropPeer(peerId);
      };
      return peer;
    },
    [dropPeer, watchLevel],
  );

  // ---- join -------------------------------------------------------------
  const doJoin = useCallback(
    (target: string) => {
      setError(null);
      setConnecting(true);
      navigator.mediaDevices
        ?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        .then((stream) => {
          streamRef.current = stream;
          for (const t of stream.getAudioTracks()) t.enabled = !mutedRef.current;
          channelRef.current = target;
          setChannelId(target);
          setConnecting(false);
          api.current.join.mutate({
            channelId: target,
            muted: mutedRef.current,
            deafened: deafenedRef.current,
          });
        })
        .catch((e: unknown) => {
          setConnecting(false);
          const name = (e as { name?: string })?.name;
          setError(
            name === "NotAllowedError"
              ? "Microphone permission denied — allow it to join voice."
              : name === "NotFoundError"
                ? "No microphone found."
                : "Could not open the microphone.",
          );
        });
    },
    [],
  );

  const doLeave = useCallback(() => {
    teardown();
    setChannelId(null);
    api.current.leaveCall.mutate(undefined, {
      onSuccess: () => api.current.utils.chat.list.invalidate(),
    });
  }, [teardown]);

  // ---- heartbeat + mesh upkeep ------------------------------------------
  useEffect(() => {
    if (!channelId) return;
    const beat = window.setInterval(() => {
      api.current.join.mutate({
        channelId,
        muted: mutedRef.current,
        deafened: deafenedRef.current,
      });
    }, VOICE_HEARTBEAT_MS);
    return () => window.clearInterval(beat);
  }, [channelId]);

  // Who else is here: open a connection to each newcomer, drop the leavers.
  const voiceState = trpc.chat.voiceState.useQuery(
    { channelId: channelId ?? "" },
    { enabled: !!channelId, refetchInterval: STATE_POLL_MS },
  );
  const peerIdsKey = (voiceState.data ?? [])
    .map((m) => m.id)
    .sort()
    .join(",");

  // The channel list draws the roster under each voice channel from chat.list,
  // which polls slowly. Push it whenever the room's population changes so the
  // faces appear and disappear as people come and go.
  useEffect(() => {
    if (!channelId) return;
    api.current.utils.chat.list.invalidate();
  }, [peerIdsKey, channelId]);
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !streamRef.current) return;
    const ids = peerIdsKey ? peerIdsKey.split(",") : [];
    const others = ids.filter((id) => id !== myId);

    for (const peerId of others) {
      if (peersRef.current.has(peerId)) continue;
      const peer = peerFor(peerId, channel);
      // Only one side offers, or both would and the handshake would collide.
      if (!isVoiceInitiator(myId, peerId)) continue;
      void (async () => {
        try {
          const offer = await peer.pc.createOffer();
          await peer.pc.setLocalDescription(offer);
          api.current.signal.mutate({
            channelId: channel,
            toUserId: peerId,
            kind: "offer",
            payload: JSON.stringify(offer),
          });
        } catch {
          dropPeer(peerId);
        }
      })();
    }
    for (const known of [...peersRef.current.keys()]) {
      if (!others.includes(known)) dropPeer(known);
    }
  }, [peerIdsKey, myId, peerFor, dropPeer]);

  // ---- drain the signalling mailbox --------------------------------------
  useEffect(() => {
    if (!channelId) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      api.current.poll.mutate(
        { channelId },
        {
          onSuccess: async (signals) => {
            const channel = channelRef.current;
            if (!channel) return;
            for (const s of signals) {
              const peer = peerFor(s.fromUserId, channel);
              try {
                if (s.kind === "offer") {
                  await peer.pc.setRemoteDescription(JSON.parse(s.payload));
                  for (const c of peer.pending.splice(0)) {
                    await peer.pc.addIceCandidate(c).catch(() => {});
                  }
                  const answer = await peer.pc.createAnswer();
                  await peer.pc.setLocalDescription(answer);
                  api.current.signal.mutate({
                    channelId: channel,
                    toUserId: s.fromUserId,
                    kind: "answer",
                    payload: JSON.stringify(answer),
                  });
                } else if (s.kind === "answer") {
                  await peer.pc.setRemoteDescription(JSON.parse(s.payload));
                  for (const c of peer.pending.splice(0)) {
                    await peer.pc.addIceCandidate(c).catch(() => {});
                  }
                } else {
                  const candidate = JSON.parse(s.payload) as RTCIceCandidateInit;
                  // A candidate can beat its offer here; hold it until the
                  // remote description exists or addIceCandidate throws.
                  if (peer.pc.remoteDescription) {
                    await peer.pc.addIceCandidate(candidate).catch(() => {});
                  } else {
                    peer.pending.push(candidate);
                  }
                }
              } catch {
                dropPeer(s.fromUserId);
              }
            }
          },
        },
      );
    };
    const timer = window.setInterval(tick, SIGNAL_POLL_MS);
    tick();
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [channelId, peerFor, dropPeer]);

  // ---- speaking rings -----------------------------------------------------
  useEffect(() => {
    if (!channelId) return;
    const buf = new Uint8Array(256);
    const timer = window.setInterval(() => {
      const loud = new Set<string>();
      for (const [id, analyser] of analysersRef.current) {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        if (sum / buf.length > 12) loud.add(id);
      }
      setSpeaking((prev) => {
        if (prev.size === loud.size && [...prev].every((id) => loud.has(id))) return prev;
        return loud;
      });
    }, 220);
    return () => window.clearInterval(timer);
  }, [channelId]);

  // ---- controls -----------------------------------------------------------
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      for (const t of streamRef.current?.getAudioTracks() ?? []) t.enabled = !next;
      if (channelRef.current) {
        api.current.join.mutate({
          channelId: channelRef.current,
          muted: next,
          deafened: deafenedRef.current,
        });
      }
      return next;
    });
  }, []);

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev;
      deafenedRef.current = next;
      for (const peer of peersRef.current.values()) peer.audio.muted = next;
      // Deafening implies muting, the way Discord does it.
      if (next && !mutedRef.current) {
        mutedRef.current = true;
        setMuted(true);
        for (const t of streamRef.current?.getAudioTracks() ?? []) t.enabled = false;
      }
      if (channelRef.current) {
        api.current.join.mutate({
          channelId: channelRef.current,
          muted: mutedRef.current,
          deafened: next,
        });
      }
      return next;
    });
  }, []);

  // Leaving the page must not leave a ghost sitting in the channel.
  useEffect(() => {
    const bail = () => {
      if (channelRef.current) {
        teardown();
        api.current.leaveCall.mutate();
      }
    };
    window.addEventListener("pagehide", bail);
    return () => {
      window.removeEventListener("pagehide", bail);
      bail();
    };
  }, [teardown]);

  return {
    channelId,
    connecting,
    error,
    muted,
    deafened,
    speaking,
    join: doJoin,
    leave: doLeave,
    toggleMute,
    toggleDeafen,
  };
}
