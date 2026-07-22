"use client";

import { useState } from "react";
import { Loader2, Phone, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/app/form-select";
import {
  ClientStatusBadge,
  TemperatureBadge,
  TaskStatusBadge,
} from "@/components/app/status-badge";
import { trpc } from "@/lib/trpc/client";
import { relativeTime } from "@/lib/format";

const CHANNELS = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "meeting", label: "Meeting" },
];
const OUTCOMES = [
  { value: "followup", label: "Needs follow-up" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "closed", label: "Closed" },
];

export function ClientSheet({
  clientId,
  open,
  canManage,
  onOpenChange,
}: {
  clientId: string | null;
  open: boolean;
  canManage: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const query = trpc.clients.byId.useQuery(
    { id: clientId ?? "" },
    { enabled: open && !!clientId },
  );
  const client = query.data;

  const [channel, setChannel] = useState("call");
  const [outcome, setOutcome] = useState("followup");
  const [note, setNote] = useState("");

  const addOutreach = trpc.clients.addOutreach.useMutation({
    onSuccess: () => {
      utils.clients.byId.invalidate({ id: clientId ?? "" });
      utils.clients.list.invalidate();
      setNote("");
      toast.success("Outreach logged.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg!">
        <SheetTitle className="sr-only">Client details</SheetTitle>
        {!client ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-border p-5 pr-12">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {client.companyName}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <ClientStatusBadge status={client.status} />
                <TemperatureBadge temperature={client.temperature} />
                {client.category ? (
                  <span className="text-xs text-muted-foreground">
                    · {client.category}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                {client.ownerName ? <p>Contact: {client.ownerName}</p> : null}
                {client.email ? (
                  <p className="flex items-center gap-1.5">
                    <Mail className="size-3.5" /> {client.email}
                  </p>
                ) : null}
                {client.phone ? (
                  <p className="flex items-center gap-1.5">
                    <Phone className="size-3.5" /> {client.phone}
                  </p>
                ) : null}
                {client.manager ? (
                  <p>Manager: {client.manager.name}</p>
                ) : null}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-6 p-5">
                {client.notes ? (
                  <p className="rounded-lg bg-muted/40 p-3 text-sm">
                    {client.notes}
                  </p>
                ) : null}

                {canManage ? (
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Log outreach
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <FormSelect
                        value={channel}
                        onValueChange={setChannel}
                        options={CHANNELS}
                      />
                      <FormSelect
                        value={outcome}
                        onValueChange={setOutcome}
                        options={OUTCOMES}
                      />
                    </div>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What happened?"
                      rows={2}
                      className="mt-2"
                    />
                    <Button
                      size="sm"
                      className="mt-2"
                      disabled={addOutreach.isPending}
                      onClick={() =>
                        addOutreach.mutate({
                          clientId: client.id,
                          channel: channel as
                            | "call"
                            | "email"
                            | "whatsapp"
                            | "meeting",
                          outcome: outcome as
                            | "followup"
                            | "interested"
                            | "not_interested"
                            | "closed",
                          note,
                        })
                      }
                    >
                      {addOutreach.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      Log
                    </Button>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Outreach history
                  </p>
                  {client.outreach.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No outreach logged yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {client.outreach.map((o) => (
                        <li
                          key={o.id}
                          className="rounded-md border border-border p-2.5 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium capitalize">
                              {o.channel}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {relativeTime(o.createdAt)}
                            </span>
                          </div>
                          {o.outcome ? (
                            <p className="text-xs text-muted-foreground">
                              {o.outcome.replace("_", " ")}
                            </p>
                          ) : null}
                          {o.note ? <p className="mt-1">{o.note}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Related missions
                  </p>
                  {client.tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No missions linked.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {client.tasks.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <span className="min-w-0 truncate text-sm">
                            {t.title}
                          </span>
                          <TaskStatusBadge status={t.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
