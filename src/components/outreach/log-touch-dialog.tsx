"use client";

// Recording a follow-up, shared by the CRM table and the follow-up queue.

import { useState } from "react";
import { Loader2, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { FormSelect } from "@/components/app/form-select";
import { Button } from "@/components/ui/button";
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
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/outreach";

export type TouchTarget = { id: string; name: string; status: string };

const STATUS_OPTIONS = LEAD_STATUSES.map((s) => ({
  value: s,
  label: LEAD_STATUS_LABELS[s],
}));

export function LogTouchDialog({
  target,
  suggestion,
  onClose,
}: {
  target: TouchTarget;
  /** The queue's suggested next action, pre-filled as the note. */
  suggestion?: string;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState(suggestion ?? "");
  const [status, setStatus] = useState(
    target.status === "pending" ? "contacted" : target.status,
  );

  const touch = trpc.outreachRoom.touch.useMutation({
    onSuccess: () => {
      toast.success(`Follow-up logged for ${target.name}.`);
      utils.outreachRoom.crm.invalidate();
      utils.outreachRoom.hotLeads.invalidate();
      utils.outreachRoom.today.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a follow-up</DialogTitle>
          <DialogDescription>
            Stamps {target.name} as worked today and moves it along the pipeline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="touch-status">Where it stands now</Label>
            <FormSelect
              id="touch-status"
              value={status}
              onValueChange={setStatus}
              options={STATUS_OPTIONS}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="touch-note">What happened</Label>
            <Textarea
              id="touch-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 300))}
              placeholder="Spoke to the owner, asking for a callback Thursday."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={touch.isPending}
            onClick={() =>
              touch.mutate({
                id: target.id,
                note: note.trim() || undefined,
                status: status as (typeof LEAD_STATUSES)[number],
              })
            }
          >
            {touch.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PhoneCall className="size-4" />
            )}
            Record touch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
