"use client";

// The outreach CRM: the whole lead pipeline in one table — filter by status,
// sector or free text, and record a follow-up without leaving the row.

import { useState } from "react";
import Link from "next/link";
import {
  Contact,
  Flame,
  Handshake,
  Loader2,
  PhoneCall,
  Search,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { MetricCard } from "@/components/app/metric-card";
import { FormSelect } from "@/components/app/form-select";
import { LeadStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/outreach";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LogTouchDialog, type TouchTarget } from "./log-touch-dialog";

type Lead = RouterOutputs["outreachRoom"]["crm"]["leads"][number];

const ALL = "all";

export function OutreachCrmView() {
  const [status, setStatus] = useState<string>(ALL);
  const [sector, setSector] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [touching, setTouching] = useState<TouchTarget | null>(null);

  const crm = trpc.outreachRoom.crm.useQuery({
    status: status === ALL ? undefined : (status as (typeof LEAD_STATUSES)[number]),
    sector: sector === ALL ? undefined : sector,
    q: q.trim() || undefined,
  });

  const counts = crm.data?.counts ?? {};
  const leads = crm.data?.leads ?? [];
  const filtered = status !== ALL || sector !== ALL || q.trim().length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Outreach"
        title="Outreach CRM"
        description="Every lead the floor has worked — status, sector, owner and last touch, in one pipeline."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Leads" value={crm.data?.total ?? 0} icon={Contact} />
        <MetricCard label="Contacted" value={counts.contacted ?? 0} icon={PhoneCall} />
        <MetricCard label="Hot" value={counts.hot ?? 0} icon={Flame} />
        <MetricCard label="Converted" value={counts.converted ?? 0} icon={Handshake} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <StatusChip
            label="All"
            count={crm.data?.total ?? 0}
            active={status === ALL}
            onClick={() => setStatus(ALL)}
          />
          {LEAD_STATUSES.map((s) => (
            <StatusChip
              key={s}
              label={LEAD_STATUS_LABELS[s]}
              count={counts[s] ?? 0}
              active={status === s}
              onClick={() => setStatus(status === s ? ALL : s)}
            />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <FormSelect
            value={sector}
            onValueChange={setSector}
            className="w-44"
            options={[
              { value: ALL, label: "All sectors" },
              ...(crm.data?.sectors ?? []).map((s) => ({ value: s, label: s })),
            ]}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search lead, niche, number…"
              className="w-56 pl-8"
              aria-label="Search leads"
            />
          </div>
          {filtered ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear filters"
              onClick={() => {
                setStatus(ALL);
                setSector(ALL);
                setQ("");
              }}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Lead</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last touch</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <p className="font-medium">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {lead.niche ?? "—"}
                    {lead.phone ? ` · ${lead.phone}` : " · no number"}
                  </p>
                </TableCell>
                <TableCell className="text-muted-foreground">{lead.sector}</TableCell>
                <TableCell>
                  <LeadStatusBadge status={lead.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lead.owner?.name ?? "Unassigned"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lead.lastTouch.source === "none" ? (
                    <span title={`In the pool since ${relativeTime(lead.lastTouch.at)}`}>
                      Never worked
                    </span>
                  ) : (
                    relativeTime(lead.lastTouch.at)
                  )}
                </TableCell>
                <TableCell>
                  {lead.client ? (
                    <Link
                      href="/clients"
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {lead.client.companyName}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setTouching({ id: lead.id, name: lead.name, status: lead.status })
                    }
                  >
                    <PhoneCall className="size-3" />
                    Touch
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {crm.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : leads.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {filtered
              ? "No leads match those filters."
              : "No leads yet — push a sector list from the outreach room to fill the pipeline."}
          </p>
        ) : null}
      </Card>

      {touching ? (
        <LogTouchDialog target={touching} onClose={() => setTouching(null)} />
      ) : null}
    </>
  );
}

function StatusChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {label}
      <span className="font-mono tabular-nums opacity-70">{count}</span>
    </button>
  );
}
