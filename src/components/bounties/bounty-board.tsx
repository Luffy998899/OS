"use client";

// The Bounty Board — the open wall of unclaimed missions anyone eligible can
// grab. Urgent work carries a bonus so the fires get picked up first, and a
// craft gate keeps people from claiming work they haven't levelled into yet.
//
// One board in the product: /bounties renders this panel and nothing else does.

import { useMemo, useState } from "react";
import {
  Check,
  Flame,
  Hand,
  Loader2,
  Lock,
  Plus,
  ScrollText,
  Timer,
  Trash2,
  Trophy,
  Undo2,
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
import { FormSelect } from "@/components/app/form-select";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { URGENCY_META, type UrgencyTier } from "@/lib/bounty";
import {
  MAX_SKILL_LEVEL,
  SKILLS,
  SKILL_META,
  SKILL_TIERS,
  suggestedGate,
  tierName,
  type SkillKey,
} from "@/lib/skills";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "eligible" | SkillKey;

export function BountyBoardPanel({ onChanged }: { onChanged?: () => void }) {
  const currentUser = useCurrentUser();
  const canPost = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const board = trpc.bounty.board.useQuery(undefined, { refetchInterval: 20_000 });
  const mine = trpc.bounty.mine.useQuery();
  const [filter, setFilter] = useState<Filter>("all");
  const [postOpen, setPostOpen] = useState(false);

  const refresh = () => {
    utils.bounty.board.invalidate();
    utils.bounty.mine.invalidate();
    utils.task.myWork.invalidate();
    onChanged?.();
  };

  const claim = trpc.bounty.claim.useMutation({
    onSuccess: (res) => {
      toast.success(
        res.reward.bonus > 0
          ? `Claimed “${res.title}” — ${res.reward.total} XP (${res.reward.base} + ${res.reward.bonus} urgency bonus)`
          : `Claimed “${res.title}” — ${res.reward.total} XP`,
      );
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const release = trpc.bounty.release.useMutation({
    onSuccess: () => {
      toast.success("Back on the board for someone else.");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const unlist = trpc.bounty.unlist.useMutation({
    onSuccess: () => {
      toast.success("Pulled off the board.");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const bounties = board.data?.bounties ?? [];
  const visible = useMemo(() => {
    if (filter === "all") return bounties;
    if (filter === "eligible") return bounties.filter((b) => b.eligible);
    return bounties.filter((b) => b.skill === filter);
  }, [bounties, filter]);

  const hot = bounties.filter((b) => b.tier === "critical" || b.tier === "urgent").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All <span className="tabular-nums opacity-60">{bounties.length}</span>
          </FilterChip>
          <FilterChip active={filter === "eligible"} onClick={() => setFilter("eligible")}>
            Open to you{" "}
            <span className="tabular-nums opacity-60">{board.data?.eligibleCount ?? 0}</span>
          </FilterChip>
          {SKILLS.map((key) => {
            const count = bounties.filter((b) => b.skill === key).length;
            if (count === 0) return null;
            return (
              <FilterChip key={key} active={filter === key} onClick={() => setFilter(key)}>
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: SKILL_META[key].color }}
                />
                {SKILL_META[key].label} <span className="tabular-nums opacity-60">{count}</span>
              </FilterChip>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {hot > 0 ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <Flame className="size-3.5" />
              {hot} paying a bonus
            </span>
          ) : null}
          {canPost ? (
            <Button size="sm" onClick={() => setPostOpen(true)}>
              <Plus className="size-3.5" />
              Post a bounty
            </Button>
          ) : null}
        </div>
      </div>

      {(mine.data?.length ?? 0) > 0 ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="mb-2 font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase">
            Claimed by you
          </p>
          <ul className="space-y-1.5">
            {mine.data?.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{m.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {m.points + m.bountyBonus} XP
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={release.isPending}
                    onClick={() => release.mutate({ id: m.id })}
                  >
                    <Undo2 className="size-3" />
                    Release
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {board.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <ScrollText className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            {bounties.length === 0 ? "The board is clear" : "Nothing matches that filter"}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {bounties.length === 0
              ? "Unassigned missions posted to the board show up here for anyone eligible to grab."
              : "Try another craft, or switch back to all bounties."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {visible.map((b) => (
            <li
              key={b.id}
              className={cn(
                "flex flex-col gap-2.5 rounded-xl border border-border p-3.5 transition-colors",
                b.eligible ? "hover:border-foreground/25" : "opacity-75",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm leading-snug font-medium">{b.title}</p>
                <UrgencyBadge tier={b.tier as UrgencyTier} />
              </div>

              {b.description ? (
                <p className="line-clamp-2 text-xs text-muted-foreground">{b.description}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                <span
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
                  style={{
                    background: `${SKILL_META[b.skill as SkillKey].color}1f`,
                    color: SKILL_META[b.skill as SkillKey].color,
                  }}
                >
                  {b.skillLabel}
                  {b.minSkillLevel > 0 ? ` · ${b.requiredTier}` : ""}
                </span>
                {b.room ? <span>{b.room.name}</span> : null}
                {b.client ? <span>· {b.client.companyName}</span> : null}
                {b.dueAt ? (
                  <span
                    className={cn(
                      "flex items-center gap-1",
                      (b.hoursLeft ?? 99) < 24 && "font-medium text-destructive",
                    )}
                  >
                    <Timer className="size-3" />
                    {relativeTime(b.dueAt)}
                  </span>
                ) : null}
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
                <span className="flex items-baseline gap-1.5">
                  <Trophy className="size-3.5 translate-y-0.5 text-muted-foreground" />
                  <span className="font-semibold tabular-nums">{b.total}</span>
                  <span className="text-xs text-muted-foreground">XP</span>
                  {b.bonus > 0 ? (
                    <span className="text-xs font-medium text-warning">
                      +{b.bonus} bonus
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-1.5">
                  {canPost ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="Pull off the board"
                      disabled={unlist.isPending}
                      onClick={() => unlist.mutate({ id: b.id })}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  ) : null}
                  {b.eligible ? (
                    <Button
                      size="xs"
                      disabled={claim.isPending}
                      onClick={() => claim.mutate({ id: b.id })}
                    >
                      {claim.isPending && claim.variables?.id === b.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Hand className="size-3" />
                      )}
                      Claim
                    </Button>
                  ) : (
                    <span
                      className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-[0.7rem] font-medium text-muted-foreground"
                      title={`Needs ${b.skillLabel} ${b.requiredTier} — you're ${tierName(b.yourLevel)}`}
                    >
                      <Lock className="size-3" />
                      {b.requiredTier}
                    </span>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canPost ? (
        <PostBountyDialog open={postOpen} onOpenChange={setPostOpen} onPosted={refresh} />
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function UrgencyBadge({ tier }: { tier: UrgencyTier }) {
  const meta = URGENCY_META[tier];
  if (tier === "standard") return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase"
      style={{ background: `${meta.color}22`, color: meta.color }}
    >
      {tier === "critical" ? <Flame className="size-3" /> : null}
      {meta.label}
    </span>
  );
}

const VERTICALS = [
  { value: "website-dev", label: "Website" },
  { value: "digital-marketing", label: "Marketing" },
  { value: "roadmap", label: "Roadmap" },
  { value: "client-outreach", label: "Outreach" },
  { value: "billing", label: "Billing" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High (+25% XP)" },
  { value: "urgent", label: "Urgent (+50% XP)" },
];

function PostBountyDialog({
  open,
  onOpenChange,
  onPosted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPosted: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [vertical, setVertical] = useState("roadmap");
  const [priority, setPriority] = useState("medium");
  const [skill, setSkill] = useState<SkillKey>("ops");
  const [points, setPoints] = useState("20");
  const [gate, setGate] = useState("0");
  const [gateTouched, setGateTouched] = useState(false);
  const [dueAt, setDueAt] = useState("");

  const post = trpc.bounty.post.useMutation({
    onSuccess: () => {
      toast.success("Pinned to the bounty board.");
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setDueAt("");
      setGateTouched(false);
      onPosted();
    },
    onError: (e) => toast.error(e.message),
  });

  // Managers shouldn't have to guess a gate — follow the size and urgency until
  // they say otherwise.
  const numericPoints = Number(points) || 0;
  const autoGate = suggestedGate(numericPoints, priority);
  const effectiveGate = gateTouched ? Number(gate) : autoGate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Post a bounty</DialogTitle>
          <DialogDescription>
            An unassigned mission on the open board. Anyone whose craft level clears
            the gate can grab it — urgent ones pay a bonus on top of the base XP.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bounty-title">Title</Label>
            <Input
              id="bounty-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cut the launch teaser to 30s"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bounty-desc">Brief</Label>
            <Textarea
              id="bounty-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What done looks like."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Craft</Label>
              <FormSelect
                value={skill}
                onValueChange={(v) => setSkill(v as SkillKey)}
                options={SKILLS.map((s) => ({ value: s, label: SKILL_META[s].label }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vertical</Label>
              <FormSelect value={vertical} onValueChange={setVertical} options={VERTICALS} />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <FormSelect value={priority} onValueChange={setPriority} options={PRIORITIES} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bounty-points">Base XP</Label>
              <Input
                id="bounty-points"
                type="number"
                min={0}
                max={1000}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Craft level needed</Label>
              <FormSelect
                value={String(effectiveGate)}
                onValueChange={(v) => {
                  setGate(v);
                  setGateTouched(true);
                }}
                options={SKILL_TIERS.slice(0, MAX_SKILL_LEVEL + 1).map((t) => ({
                  value: String(t.level),
                  label: `${t.name}${t.level === 0 ? " (anyone)" : ""}`,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bounty-due">Due</Label>
              <Input
                id="bounty-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>

          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {priority === "urgent" || priority === "high" ? (
              <>
                Pays up to{" "}
                <span className="font-semibold text-foreground">
                  {Math.round(numericPoints * (priority === "urgent" ? 1.8 : 1.55))} XP
                </span>{" "}
                once the deadline closes in.
              </>
            ) : (
              <>
                Pays <span className="font-semibold text-foreground">{numericPoints} XP</span>.
                Set a deadline or raise the priority to add an urgency bonus.
              </>
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length < 3 || post.isPending}
            onClick={() =>
              post.mutate({
                title: title.trim(),
                description: description.trim() || undefined,
                vertical: vertical as "roadmap",
                priority: priority as "medium",
                skill,
                points: Math.max(0, Math.min(1000, numericPoints)),
                minSkillLevel: effectiveGate,
                dueAt: dueAt ? new Date(dueAt) : undefined,
              })
            }
          >
            {post.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Post to board
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
