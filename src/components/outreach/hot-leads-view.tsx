"use client";

// Hot leads & follow-ups: the queue of leads that will go cold if nobody moves
// on them today. Ordered by urgency, each row says why it surfaced and what the
// next move is.

import { useState } from "react";
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  Flame,
  Loader2,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { MetricCard } from "@/components/app/metric-card";
import { LeadStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LogTouchDialog, type TouchTarget } from "./log-touch-dialog";

type FollowUpLead = RouterOutputs["outreachRoom"]["hotLeads"]["leads"][number];

const TIER_META: Record<
  FollowUpLead["tier"],
  { label: string; card: string; chip: string }
> = {
  now: {
    label: "Call now",
    card: "ring-destructive/30",
    chip: "bg-destructive/10 text-destructive",
  },
  today: {
    label: "Today",
    card: "ring-warning/30",
    chip: "bg-warning/10 text-warning",
  },
  soon: {
    label: "This week",
    card: "ring-foreground/10",
    chip: "bg-muted text-muted-foreground",
  },
};

export function HotLeadsView() {
  const [mineOnly, setMineOnly] = useState(false);
  const [touching, setTouching] = useState<{
    target: TouchTarget;
    suggestion: string;
  } | null>(null);

  const queue = trpc.outreachRoom.hotLeads.useQuery(
    { mineOnly },
    { refetchInterval: 60_000 },
  );
  const leads = queue.data?.leads ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Outreach"
        title="Hot leads & follow-ups"
        description="Leads mid-handshake, marked hot, or gone quiet — most urgent first, with the next move already worked out."
      >
        <div className="flex items-center gap-2">
          <Switch
            id="mine-only"
            checked={mineOnly}
            onCheckedChange={(v) => setMineOnly(v === true)}
          />
          <Label htmlFor="mine-only" className="text-sm font-normal">
            Only mine
          </Label>
        </div>
      </PageHeader>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <MetricCard label="Call now" value={queue.data?.now ?? 0} icon={AlarmClock} />
        <MetricCard label="Today" value={queue.data?.today ?? 0} icon={Flame} />
        <MetricCard label="This week" value={queue.data?.soon ?? 0} icon={CalendarClock} />
      </div>

      {queue.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : leads.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm font-medium">Nothing is going cold.</p>
          <p className="text-sm text-muted-foreground">
            {mineOnly
              ? "None of your leads need chasing right now."
              : "Every lead has been worked recently — the queue is clear."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {leads.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              onLog={() =>
                setTouching({
                  target: { id: lead.id, name: lead.name, status: lead.status },
                  suggestion: lead.nextAction,
                })
              }
            />
          ))}
        </div>
      )}

      {touching ? (
        <LogTouchDialog
          target={touching.target}
          suggestion={touching.suggestion}
          onClose={() => setTouching(null)}
        />
      ) : null}
    </>
  );
}

function LeadRow({ lead, onLog }: { lead: FollowUpLead; onLog: () => void }) {
  const tier = TIER_META[lead.tier];
  return (
    <Card className={cn("gap-3", tier.card)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{lead.name}</p>
            <LeadStatusBadge status={lead.status} />
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase",
                tier.chip,
              )}
            >
              {tier.label}
            </span>
            {lead.otp.pending ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-info">
                <ShieldCheck className="size-3" />
                OTP live
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {lead.sector}
            {lead.niche ? ` · ${lead.niche}` : ""}
            {lead.phone ? ` · ${lead.phone}` : " · no number"}
            {` · ${lead.owner?.name ?? "unassigned"}`}
            {lead.lastTouch.source === "none"
              ? " · never worked"
              : ` · ${relativeTime(lead.lastTouch.at)}`}
          </p>
        </div>
        <Button size="sm" onClick={onLog}>
          <PhoneCall className="size-3.5" />
          Log follow-up
        </Button>
      </div>
      <div className="grid gap-2 px-4 sm:grid-cols-2">
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {lead.why}
        </p>
        <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium">
          <ArrowRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
          {lead.nextAction}
        </p>
      </div>
    </Card>
  );
}
