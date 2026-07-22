import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export const VERTICAL_LABELS: Record<string, string> = {
  "website-dev": "Website",
  "digital-marketing": "Marketing",
  roadmap: "Roadmap",
  "client-outreach": "Outreach",
  billing: "Billing",
};

function Swatch({
  label,
  cls,
  dot,
}: {
  label: string;
  cls: string;
  dot?: boolean;
}) {
  return (
    <span className={cn(base, cls)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {label}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    todo: { label: "To do", cls: "bg-muted text-muted-foreground" },
    in_progress: { label: "In progress", cls: "bg-info/10 text-info" },
    review: { label: "In review", cls: "bg-warning/10 text-warning" },
    done: { label: "Done", cls: "bg-success/10 text-success" },
    blocked: { label: "Blocked", cls: "bg-destructive/10 text-destructive" },
  };
  const s = map[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground",
  };
  return <Swatch label={s.label} cls={s.cls} dot />;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    low: { label: "Low", cls: "bg-muted text-muted-foreground" },
    medium: { label: "Medium", cls: "bg-muted text-foreground" },
    high: { label: "High", cls: "bg-warning/10 text-warning" },
    urgent: { label: "Urgent", cls: "bg-destructive/10 text-destructive" },
  };
  const s = map[priority] ?? {
    label: priority,
    cls: "bg-muted text-muted-foreground",
  };
  return <Swatch label={s.label} cls={s.cls} />;
}

export function InvoiceBadge({ status }: { status: string }) {
  return status === "invoiced" ? (
    <Swatch label="Invoiced" cls="bg-success/10 text-success" />
  ) : (
    <Swatch label="Not invoiced" cls="bg-muted text-muted-foreground" />
  );
}

export function ClientStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    new: { label: "New", cls: "bg-info/10 text-info" },
    active: { label: "Active", cls: "bg-success/10 text-success" },
    suspended: { label: "Suspended", cls: "bg-warning/10 text-warning" },
    churned: { label: "Churned", cls: "bg-destructive/10 text-destructive" },
  };
  const s = map[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground",
  };
  return <Swatch label={s.label} cls={s.cls} />;
}

export function TemperatureBadge({ temperature }: { temperature: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    hot: { label: "Hot", cls: "bg-destructive/10 text-destructive" },
    warm: { label: "Warm", cls: "bg-warning/10 text-warning" },
    cold: { label: "Cold", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[temperature] ?? {
    label: temperature,
    cls: "bg-muted text-muted-foreground",
  };
  return <Swatch label={s.label} cls={s.cls} dot />;
}

export function VerticalBadge({ vertical }: { vertical: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      {VERTICAL_LABELS[vertical] ?? vertical}
    </span>
  );
}
