"use client";

// The outreach room: today's sector run in AI order, the pending pool by
// sector, and the OTP handshake that drops a hot lead straight into the CRM.

import { useState } from "react";
import {
  Check,
  Flame,
  ListPlus,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const STATUS_CLS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  contacted: "bg-info/10 text-info",
  hot: "bg-destructive/10 text-destructive",
  converted: "bg-success/10 text-success",
  dropped: "bg-muted text-muted-foreground line-through",
};

export function OutreachPanel() {
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const today = trpc.outreachRoom.today.useQuery(undefined, { refetchInterval: 20_000 });
  const [pushOpen, setPushOpen] = useState(false);
  const [otpFor, setOtpFor] = useState<{ id?: string; phone: string } | null>(null);

  const refresh = () => utils.outreachRoom.today.invalidate();
  const assign = trpc.outreachRoom.assignSector.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.count} leads on today's run.`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const plan = trpc.outreachRoom.planMyDay.useMutation({
    onSuccess: () => {
      toast.success("Day re-planned for the best route through the list.");
      refresh();
    },
  });
  const setStatus = trpc.outreachRoom.setStatus.useMutation({ onSuccess: refresh });

  const targets = today.data?.targets ?? [];
  const done = today.data?.done ?? 0;

  return (
    <div className="space-y-4">
      {/* Sector picker / day header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {targets.length > 0
              ? `Today's run — ${targets[0].sector}`
              : "No sector assigned today"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {targets.length > 0
              ? `${done}/${targets.length} worked · ordered for efficiency`
              : `${today.data?.pendingPool ?? 0} leads waiting in the pending room`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {targets.length > 0 ? (
            <Button size="xs" variant="outline" disabled={plan.isPending} onClick={() => plan.mutate()}>
              <Sparkles className="size-3" />
              Re-plan my day
            </Button>
          ) : null}
          {canManage ? (
            <Button size="xs" onClick={() => setPushOpen(true)}>
              <ListPlus className="size-3" />
              Push a sector list
            </Button>
          ) : null}
        </div>
      </div>

      {/* Pick a sector when idle */}
      {targets.length === 0 && (today.data?.sectors.length ?? 0) > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Grab a sector for today:</p>
          <div className="flex flex-wrap gap-1.5">
            {today.data?.sectors.map((s) => (
              <button
                key={s.sector}
                disabled={assign.isPending}
                onClick={() => assign.mutate({ sector: s.sector })}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-foreground/40"
              >
                <MapPin className="size-3 text-muted-foreground" />
                {s.sector}
                <span className="font-mono text-muted-foreground">{s.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {today.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : targets.length === 0 && (today.data?.sectors.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          The pending room is empty — a manager pushes sector lists here, one sector per agent per day.
        </p>
      ) : targets.length > 0 ? (
        <ul className="space-y-1.5">
          {targets.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2.5 rounded-lg border border-border p-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted font-mono text-xs font-bold">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.niche ?? "—"}
                  {t.phone ? ` · ${t.phone}` : " · no number"}
                  {t.notes ? ` · ${t.notes}` : ""}
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize", STATUS_CLS[t.status])}>
                {t.status}
              </span>
              <span className="flex shrink-0 gap-1">
                {t.status === "pending" ? (
                  <Button size="xs" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: t.id, status: "contacted" })}>
                    <Phone className="size-3" />
                    Called
                  </Button>
                ) : null}
                {(t.status === "pending" || t.status === "contacted") ? (
                  <>
                    <Button
                      size="xs"
                      disabled={setStatus.isPending}
                      onClick={() => {
                        setStatus.mutate({ id: t.id, status: "hot" });
                        setOtpFor({ id: t.id, phone: t.phone ?? "" });
                      }}
                    >
                      <Flame className="size-3" />
                      Hot
                    </Button>
                    <Button size="icon-xs" variant="ghost" title="Drop" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: t.id, status: "dropped" })}>
                      <X className="size-3" />
                    </Button>
                  </>
                ) : null}
                {t.status === "hot" ? (
                  <Button size="xs" onClick={() => setOtpFor({ id: t.id, phone: t.phone ?? "" })}>
                    <ShieldCheck className="size-3" />
                    OTP
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {otpFor ? (
        <OtpDialog
          target={otpFor}
          onClose={() => setOtpFor(null)}
          onConverted={() => {
            setOtpFor(null);
            refresh();
          }}
        />
      ) : null}
      {canManage ? <PushDialog open={pushOpen} onOpenChange={setPushOpen} onPushed={refresh} /> : null}
    </div>
  );
}

/** The handshake: send the code, the lead reads it back, they land in the CRM. */
function OtpDialog({
  target,
  onClose,
  onConverted,
}: {
  target: { id?: string; phone: string };
  onClose: () => void;
  onConverted: () => void;
}) {
  const [phone, setPhone] = useState(target.phone);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ demo: boolean; code: string | null } | null>(null);
  const send = trpc.outreachRoom.sendOtp.useMutation({
    onSuccess: (r) => {
      setSent({ demo: r.demo, code: r.code });
      toast.success(r.demo ? "OTP generated — read it out to the lead." : "OTP sent by SMS.");
    },
    onError: (e) => toast.error(e.message),
  });
  const verify = trpc.outreachRoom.verifyOtp.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.companyName} is in the CRM — marked hot. 🔥`);
      onConverted();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>OTP handshake</DialogTitle>
          <DialogDescription>
            The lead confirms the code on the spot and auto-fills into the CRM as a hot client.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="otp-phone">Lead's number</Label>
            <div className="flex gap-1.5">
              <Input id="otp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
              <Button disabled={phone.trim().length < 6 || send.isPending} onClick={() => send.mutate({ phone: phone.trim(), targetId: target.id })}>
                {send.isPending ? <Loader2 className="size-4 animate-spin" /> : "Send"}
              </Button>
            </div>
          </div>
          {sent ? (
            <>
              {sent.demo && sent.code ? (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
                  No SMS provider configured — read the code to the lead:{" "}
                  <span className="font-mono text-base font-bold tracking-widest text-foreground">{sent.code}</span>
                </p>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="otp-code">Code the lead reads back</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="otp-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6 digits"
                    className="text-center font-mono tracking-widest"
                  />
                  <Button disabled={code.length !== 6 || verify.isPending} onClick={() => verify.mutate({ phone: phone.trim(), code })}>
                    {verify.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Verify
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PushDialog({
  open,
  onOpenChange,
  onPushed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPushed: () => void;
}) {
  const [sector, setSector] = useState("");
  const [niche, setNiche] = useState("");
  const [list, setList] = useState("");
  const push = trpc.outreachRoom.push.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.added} leads pushed into the pending room.`);
      onOpenChange(false);
      setList("");
      onPushed();
    },
    onError: (e) => toast.error(e.message),
  });

  const parsed = list
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      // "Name, phone, note" — phone and note optional.
      const [name, phone, ...rest] = line.split(",").map((s) => s.trim());
      return { name, phone: phone || undefined, notes: rest.join(", ") || undefined };
    })
    .filter((e) => e.name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Push a sector list</DialogTitle>
          <DialogDescription>
            One lead per line: <code className="font-mono text-xs">Name, phone, note</code>. They wait in
            the pending room until an agent takes the sector.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="push-sector">Sector / area</Label>
              <Input id="push-sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Sector 14 market" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="push-niche">Niche</Label>
              <Input id="push-niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="salons" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="push-list">Leads ({parsed.length})</Label>
            <Textarea
              id="push-list"
              rows={7}
              value={list}
              onChange={(e) => setList(e.target.value)}
              placeholder={"Glow Salon, 9812345670, big storefront\nStyle Studio, 9812345671"}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={sector.trim().length < 2 || parsed.length === 0 || push.isPending}
            onClick={() => push.mutate({ sector: sector.trim(), niche: niche.trim() || undefined, entries: parsed })}
          >
            {push.isPending ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
            Push {parsed.length} leads
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
