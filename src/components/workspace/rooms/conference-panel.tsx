"use client";

// The conference hall: urgent meetings, disclosures, incentives, and the weekly
// do's & don'ts round. Acks show who has actually seen each item.

import { useEffect, useRef, useState } from "react";
import { Bell, Check, Gift, Loader2, Megaphone, Plus, ThumbsUp, Trash2 } from "lucide-react";
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
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_META: Record<string, { label: string; icon: typeof Bell; cls: string }> = {
  urgent_meeting: { label: "Urgent meeting", icon: Bell, cls: "bg-destructive/10 text-destructive" },
  disclosure: { label: "Disclosure", icon: Megaphone, cls: "bg-info/10 text-info" },
  incentive: { label: "Incentive", icon: Gift, cls: "bg-success/10 text-success" },
  feedback: { label: "Weekly feedback", icon: ThumbsUp, cls: "bg-warning/10 text-warning" },
};

export function ConferencePanel({ initialCompose }: { initialCompose?: boolean }) {
  const currentUser = useCurrentUser();
  const canPost = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const list = trpc.conference.list.useQuery(undefined, { refetchInterval: 15_000 });
  const [postOpen, setPostOpen] = useState(false);

  // The game can deep-link straight into the composer; only ever auto-open once.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (initialCompose && canPost && !autoOpened.current) {
      autoOpened.current = true;
      setPostOpen(true);
    }
  }, [initialCompose, canPost]);

  const refresh = () => {
    utils.conference.list.invalidate();
    utils.workspace.state.invalidate();
  };
  const ack = trpc.conference.ack.useMutation({ onSuccess: refresh });
  const remove = trpc.conference.remove.useMutation({ onSuccess: refresh });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Everything said in the hall stays on the screen — tap the check so the poster knows you saw it.
        </p>
        {canPost ? (
          <Button size="sm" onClick={() => setPostOpen(true)}>
            <Plus className="size-3.5" />
            Post announcement
          </Button>
        ) : (
          <p className="shrink-0 text-xs text-muted-foreground">Only leads can post — ask a manager</p>
        )}
      </div>

      {list.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (list.data?.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          The hall is quiet. Announcements, incentives and the weekly feedback land here.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.data?.map((a) => {
            const meta = KIND_META[a.kind] ?? KIND_META.disclosure;
            const Icon = meta.icon;
            const upcoming = a.meetingAt && new Date(a.meetingAt) > new Date();
            return (
              <li
                key={a.id}
                className={cn(
                  "rounded-xl border p-3.5",
                  a.kind === "urgent_meeting" && upcoming ? "border-destructive/40 bg-destructive/5" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", meta.cls)}>
                      <Icon className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {meta.label} · {a.postedBy} · {relativeTime(a.createdAt)}
                        {a.meetingAt
                          ? ` · ${new Date(a.meetingAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
                          : ""}
                      </p>
                      {a.body ? <p className="mt-1.5 text-sm whitespace-pre-wrap text-muted-foreground">{a.body}</p> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => (a.acked ? undefined : ack.mutate({ id: a.id }))}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] font-medium transition-colors",
                        a.acked ? "bg-success/10 text-success" : "bg-muted text-muted-foreground hover:text-foreground",
                      )}
                      title={a.acked ? "You've seen this" : "Mark as seen"}
                    >
                      <Check className="size-3" />
                      {a.ackCount}
                    </button>
                    {canPost ? (
                      <Button size="icon-xs" variant="ghost" onClick={() => remove.mutate({ id: a.id })}>
                        <Trash2 className="size-3" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canPost ? <PostDialog open={postOpen} onOpenChange={setPostOpen} onPosted={refresh} /> : null}
    </div>
  );
}

const KIND_OPTIONS = [
  { value: "urgent_meeting", label: "Urgent meeting" },
  { value: "disclosure", label: "Disclosure" },
  { value: "incentive", label: "Incentive" },
  { value: "feedback", label: "Weekly do's & don'ts" },
];

function PostDialog({
  open,
  onOpenChange,
  onPosted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPosted: () => void;
}) {
  const [kind, setKind] = useState("disclosure");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  // Mirrors the router's rules so the Post button never submits a rejected shape.
  const titleReady = title.trim().length >= 2;
  const meetingReady = kind !== "urgent_meeting" || meetingAt !== "";
  const post = trpc.conference.post.useMutation({
    onSuccess: () => {
      toast.success("Announcement posted to the hall");
      onOpenChange(false);
      setTitle("");
      setBody("");
      setMeetingAt("");
      onPosted();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Announce in the hall</DialogTitle>
          <DialogDescription>
            Urgent meetings ping everyone immediately and banner the whole floor.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <FormSelect value={kind} onValueChange={setKind} options={KIND_OPTIONS} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q3 kickoff — all hands" />
            {!titleReady ? <p className="text-xs text-muted-foreground">At least 2 characters.</p> : null}
          </div>
          {kind === "urgent_meeting" ? (
            <div className="space-y-1.5">
              <Label htmlFor="ann-at">When</Label>
              <Input id="ann-at" type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} />
              {!meetingReady ? <p className="text-xs text-muted-foreground">Urgent meetings need a time.</p> : null}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Details</Label>
            <Textarea id="ann-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What the room needs to know." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!titleReady || !meetingReady || post.isPending}
            onClick={() =>
              post.mutate({
                kind: kind as "disclosure",
                title: title.trim(),
                body: body.trim() || undefined,
                meetingAt: meetingAt ? new Date(meetingAt) : undefined,
              })
            }
          >
            {post.isPending ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
            Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
