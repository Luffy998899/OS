"use client";

// Mounted once in the app shell: quietly polls for a pending demogorgon and
// unleashes it over whatever the victim is looking at — dashboard, documents,
// or the floor itself. Vecna doesn't care which tab you're hiding in.

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { DemogorgonScare } from "./demogorgon-scare";

export function ScareWatcher() {
  const scare = trpc.workspace.myScare.useQuery(undefined, {
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  });
  // Remember what we already showed so a slow invalidate can't replay it.
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const pending = scare.data;
  if (!pending || pending.id === dismissedId) return null;

  return (
    <DemogorgonScare
      notifId={pending.id}
      body={pending.body}
      onDone={() => setDismissedId(pending.id)}
    />
  );
}
