"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { formatClock } from "@/lib/format";

export function CheckInControl() {
  const utils = trpc.useUtils();
  const current = trpc.attendance.current.useQuery();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState("");
  const [blockers, setBlockers] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const shift = current.data?.shift ?? null;

  useEffect(() => {
    if (!shift) return;
    const start = new Date(shift.checkInAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [shift?.id, shift?.checkInAt]);

  const checkIn = trpc.attendance.checkIn.useMutation({
    onSuccess: () => {
      utils.attendance.current.invalidate();
      setCheckInOpen(false);
      setNote("");
      toast.success("Checked in — have a great shift.");
    },
    onError: (e) => toast.error(e.message),
  });

  const checkOut = trpc.attendance.checkOut.useMutation({
    onSuccess: () => {
      utils.attendance.current.invalidate();
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
      utils.timesheet.summary.invalidate();
      setCheckOutOpen(false);
      setSummary("");
      setBlockers("");
      toast.success("Report submitted — see you tomorrow.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (current.isLoading) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-muted" />;
  }

  return (
    <>
      {shift ? (
        <button
          onClick={() => setCheckOutOpen(true)}
          className="flex h-9 items-center gap-2 rounded-full border border-border pr-2.5 pl-3 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          title="Check out & submit report"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <span className="font-mono tabular-nums">{formatClock(elapsed)}</span>
          <LogOut className="size-4 text-muted-foreground" />
        </button>
      ) : (
        <Button size="sm" onClick={() => setCheckInOpen(true)}>
          <LogIn className="size-4" />
          <span className="hidden sm:inline">Check in</span>
        </Button>
      )}

      {/* Check in */}
      <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start your shift</DialogTitle>
            <DialogDescription>
              Clock in to begin tracking your day. You&rsquo;ll be reminded at
              5:55 PM IST to submit your report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="checkin-note">
              What are you focusing on?{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="checkin-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Finishing the marketing site, then client calls."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckInOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => checkIn.mutate({ note })}
              disabled={checkIn.isPending}
            >
              {checkIn.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogIn className="size-4" />
              )}
              Check in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check out + day report */}
      <Dialog open={checkOutOpen} onOpenChange={setCheckOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wrap up your day</DialogTitle>
            <DialogDescription>
              Submit your day report to check out. This is what your manager and
              the AI see.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Clock className="size-4" />
            <span>
              On shift for{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatClock(elapsed)}
              </span>
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-summary">What did you get done today?</Label>
            <Textarea
              id="report-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Shipped the pricing section, reviewed 2 PRs, prepped the client demo…"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-blockers">
              Any blockers?{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="report-blockers"
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="Waiting on design assets for the hero."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckOutOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => checkOut.mutate({ summary, blockers })}
              disabled={checkOut.isPending || summary.trim().length < 5}
            >
              {checkOut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              Submit &amp; check out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
