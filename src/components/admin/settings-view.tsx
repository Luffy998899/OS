"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Sparkles,
  Mail,
  Loader2,
  Copy,
  Send,
  Check,
  Building2,
  Palette,
  Landmark,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Settings = RouterOutputs["setting"]["get"];

function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: typeof MessageSquare;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4" />
          </div>
          <div>
            <h2 className="font-heading text-sm font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </Card>
  );
}

export function SettingsView() {
  const { data, isLoading } = trpc.setting.get.useQuery();

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        description="Integrations and automation for your workspace."
      />
      {isLoading || !data ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <OrgSection data={data} />
          </div>
          <BrandingSection data={data} />
          <BankSection data={data} />
          <div className="lg:col-span-2">
            <LegalSection data={data} />
          </div>
          <div className="lg:col-span-2">
            <WhatsAppSection data={data} />
          </div>
          <AiSection data={data} />
          <EmailSection data={data} />
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SaveRow({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <Button onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Save
      </Button>
    </div>
  );
}

function OrgSection({ data }: { data: Settings }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState(data.org);
  const save = trpc.setting.updateOrg.useMutation({
    onSuccess: () => {
      utils.setting.get.invalidate();
      toast.success("Organisation saved.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <SectionCard
      icon={Building2}
      title="Organisation"
      description="Appears in the invoice header."
    >
      <Field label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="GSTIN" value={f.gstin} onChange={(v) => setF({ ...f, gstin: v })} />
        <Field label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
      </div>
      <Field label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
      <div className="space-y-2">
        <Label>Address</Label>
        <Textarea value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} rows={2} />
      </div>
      <SaveRow pending={save.isPending} onClick={() => save.mutate(f)} />
    </SectionCard>
  );
}

function BrandingSection({ data }: { data: Settings }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState(data.branding);
  const save = trpc.setting.updateBranding.useMutation({
    onSuccess: () => {
      utils.setting.get.invalidate();
      toast.success("Branding saved.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <SectionCard icon={Palette} title="Branding" description="Accent colour for the invoice PDF.">
      <Field
        label="Logo URL"
        value={f.logoUrl}
        onChange={(v) => setF({ ...f, logoUrl: v })}
        placeholder="https://…"
      />
      <div className="space-y-2">
        <Label>Primary colour</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={f.primaryColor || "#6184d6"}
            onChange={(e) => setF({ ...f, primaryColor: e.target.value })}
            className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
            aria-label="Primary colour"
          />
          <Input value={f.primaryColor} onChange={(e) => setF({ ...f, primaryColor: e.target.value })} />
        </div>
      </div>
      <SaveRow pending={save.isPending} onClick={() => save.mutate(f)} />
    </SectionCard>
  );
}

function BankSection({ data }: { data: Settings }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState(data.bank);
  const save = trpc.setting.updateBank.useMutation({
    onSuccess: () => {
      utils.setting.get.invalidate();
      toast.success("Bank details saved.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <SectionCard icon={Landmark} title="Bank details" description="Shown in the invoice payment section.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Bank name" value={f.bankName} onChange={(v) => setF({ ...f, bankName: v })} />
        <Field label="Account holder" value={f.accountHolder} onChange={(v) => setF({ ...f, accountHolder: v })} />
        <Field label="Account number" value={f.accountNumber} onChange={(v) => setF({ ...f, accountNumber: v })} />
        <Field label="IFSC" value={f.ifsc} onChange={(v) => setF({ ...f, ifsc: v })} />
      </div>
      <SaveRow pending={save.isPending} onClick={() => save.mutate(f)} />
    </SectionCard>
  );
}

function LegalSection({ data }: { data: Settings }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState(data.legal);
  const save = trpc.setting.updateLegal.useMutation({
    onSuccess: () => {
      utils.setting.get.invalidate();
      toast.success("Legal details saved.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <SectionCard
      icon={Scale}
      title="Legal & compliance"
      description="Sensitive entity records — visible only to admins."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Registered entity name" value={f.entityName} onChange={(v) => setF({ ...f, entityName: v })} />
        <Field label="PAN" value={f.pan} onChange={(v) => setF({ ...f, pan: v })} />
        <Field label="CIN" value={f.cin} onChange={(v) => setF({ ...f, cin: v })} />
      </div>
      <div className="space-y-2">
        <Label>Registered address</Label>
        <Textarea value={f.registeredAddress} onChange={(e) => setF({ ...f, registeredAddress: e.target.value })} rows={2} />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} />
      </div>
      <SaveRow pending={save.isPending} onClick={() => save.mutate(f)} />
    </SectionCard>
  );
}

function WhatsAppSection({ data }: { data: Settings }) {
  const utils = trpc.useUtils();
  const [enabled, setEnabled] = useState(data.whatsapp.enabled);
  const [ownerPhone, setOwnerPhone] = useState(data.whatsapp.ownerPhone);
  const [reviewRequired, setReviewRequired] = useState(
    data.whatsapp.reviewRequired,
  );
  const [sim, setSim] = useState("");

  const save = trpc.setting.updateWhatsApp.useMutation({
    onSuccess: () => {
      utils.setting.get.invalidate();
      toast.success("WhatsApp settings saved.");
    },
    onError: (e) => toast.error(e.message),
  });

  const simulate = trpc.setting.simulateWhatsApp.useMutation({
    onSuccess: (res) => {
      utils.task.pendingReview.invalidate();
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
      setSim("");
      toast.success(
        `Drafted "${res.title}"${res.assigneeName ? ` → ${res.assigneeName}` : ""}. Sent to the review queue.`,
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const webhookUrl = `${data.env.appUrl}${data.env.webhookPath}`;
  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    toast.success(`${label} copied.`);
  };

  return (
    <SectionCard
      icon={MessageSquare}
      title="WhatsApp integration"
      description="Message a task from WhatsApp — the AI drafts it and routes it to your review queue."
      action={
        <Badge variant={data.env.whatsappConfigured ? "default" : "secondary"}>
          {data.env.whatsappConfigured ? "Twilio configured" : "Simulation mode"}
        </Badge>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Enable WhatsApp intake</p>
          <p className="text-xs text-muted-foreground">
            Accept inbound task messages via the webhook.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Require owner review</p>
          <p className="text-xs text-muted-foreground">
            AI drafts always wait for your approval before assigning.
          </p>
        </div>
        <Switch checked={reviewRequired} onCheckedChange={setReviewRequired} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="owner-phone">Owner phone (only sender accepted)</Label>
        <Input
          id="owner-phone"
          value={ownerPhone}
          onChange={(e) => setOwnerPhone(e.target.value)}
          placeholder="+91 90000 00000"
          className="max-w-xs"
        />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() =>
            save.mutate({ enabled, ownerPhone, reviewRequired })
          }
          disabled={save.isPending}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Webhook setup (Meta / Twilio)
        </p>
        <div className="space-y-2">
          <ClipRow label="Callback URL" value={webhookUrl} onCopy={copy} />
          <ClipRow
            label="Verify token"
            value={data.env.verifyToken}
            onCopy={copy}
          />
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Send className="size-3.5" />
          Simulate a WhatsApp task
        </p>
        <Textarea
          value={sim}
          onChange={(e) => setSim(e.target.value)}
          rows={2}
          placeholder="e.g. Ask the dev team to fix the checkout bug and have marketing prep launch posts."
        />
        <div className="mt-2 flex items-center justify-between">
          <Link
            href="/admin/assign"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Open review queue →
          </Link>
          <Button
            size="sm"
            variant="outline"
            disabled={sim.trim().length < 3 || simulate.isPending}
            onClick={() => simulate.mutate({ body: sim })}
          >
            {simulate.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send as owner
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function ClipRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (v: string, label: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
        {value}
      </code>
      <button
        onClick={() => onCopy(value, label)}
        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
        aria-label={`Copy ${label}`}
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

function AiSection({ data }: { data: Settings }) {
  return (
    <SectionCard
      icon={Sparkles}
      title="AI senior manager"
      description="Powers Assign & Plan, WhatsApp parsing, and routing."
      action={
        <Badge variant={data.env.aiEnabled ? "default" : "secondary"}>
          {data.env.aiEnabled ? "Claude connected" : "Offline heuristics"}
        </Badge>
      }
    >
      <p className="text-sm text-muted-foreground">
        {data.env.aiEnabled
          ? "Claude is drafting and routing missions."
          : "Running on deterministic keyword routing. Set ANTHROPIC_API_KEY to enable Claude."}
      </p>
      <ul className="space-y-1.5 text-sm">
        {[
          "Breaks requests into missions",
          "Routes each to the best-fit teammate",
          "Always waits for owner review",
        ].map((f) => (
          <li key={f} className="flex items-center gap-2 text-muted-foreground">
            <Check className="size-3.5 text-success" />
            {f}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function EmailSection({ data }: { data: Settings }) {
  const utils = trpc.useUtils();
  const [time, setTime] = useState(data.email.reportReminderTime);
  const [enabled, setEnabled] = useState(data.email.enabled);

  const save = trpc.setting.updateEmail.useMutation({
    onSuccess: () => {
      utils.setting.get.invalidate();
      toast.success("Reminder settings saved.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <SectionCard
      icon={Mail}
      title="Report reminders"
      description="Nudges the team to submit their day report before they leave."
      action={
        <Badge variant={data.env.emailEnabled ? "default" : "secondary"}>
          {data.env.emailEnabled ? "Resend connected" : "In-app only"}
        </Badge>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Daily reminder</p>
          <p className="text-xs text-muted-foreground">
            IST · sent to anyone still checked in without a report.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reminder-time">Reminder time (IST)</Label>
        <Input
          id="reminder-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="max-w-[10rem]"
        />
        <p className="text-xs text-muted-foreground">
          Default 17:55 (5:55 PM). Scheduled via cron in production.
        </p>
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="text-xs font-medium">Links in emails point to</p>
        <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
          {data.env.appUrl}
        </p>
        {data.env.appUrl.includes("localhost") ? (
          <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
            Running on localhost — recipients can&apos;t open these links. Set{" "}
            <code className="font-mono">APP_URL</code> to your public URL (in
            Codespaces it&apos;s auto-detected once the port is forwarded).
          </p>
        ) : data.env.appUrlAutoDetected ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Auto-detected from your environment. Make sure the port is set to{" "}
            <strong>Public</strong> so recipients can open the link.
          </p>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() =>
            save.mutate({ reportReminderTime: time, enabled })
          }
          disabled={save.isPending}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </SectionCard>
  );
}
