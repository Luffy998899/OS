"use client";

import { useState } from "react";
import { Clock, Timer, ReceiptText, Plus, Loader2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { MetricCard } from "@/components/app/metric-card";
import { InvoiceBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc/client";
import { formatDuration, initials } from "@/lib/format";
import { istDateString } from "@/lib/time";
import { cn } from "@/lib/utils";

function EmptyRow({ span, text }: { span: number; text: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={span}
        className="py-10 text-center text-sm text-muted-foreground"
      >
        {text}
      </TableCell>
    </TableRow>
  );
}

export function TimesheetView({ canSeeAll }: { canSeeAll: boolean }) {
  const [scope, setScope] = useState<"me" | "all">("me");
  const [addOpen, setAddOpen] = useState(false);

  const effectiveScope = canSeeAll ? scope : "me";
  const summary = trpc.timesheet.summary.useQuery({ scope: effectiveScope });
  const entries = trpc.timesheet.entries.useQuery({ scope: effectiveScope });
  const current = trpc.attendance.current.useQuery();
  const history = trpc.attendance.history.useQuery();

  const showUser = canSeeAll && scope === "all";

  return (
    <>
      <PageHeader
        eyebrow="Time"
        title="Timesheet"
        description="Logged work, invoicing status, and your attendance history."
      >
        {canSeeAll ? (
          <div className="flex rounded-md border border-border p-0.5">
            {(["me", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors",
                  scope === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "me" ? "My time" : "Team"}
              </button>
            ))}
          </div>
        ) : null}
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add time entry
        </Button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Hours worked"
          value={formatDuration(summary.data?.totalSeconds ?? 0)}
          hint={`${summary.data?.count ?? 0} entries`}
          icon={Timer}
        />
        <MetricCard
          label="Invoiced"
          value={formatDuration(summary.data?.invoicedSeconds ?? 0)}
          icon={ReceiptText}
        />
        <MetricCard
          label="Not invoiced"
          value={formatDuration(summary.data?.notInvoicedSeconds ?? 0)}
          icon={Clock}
        />
      </div>

      <Tabs defaultValue="entries" className="w-full">
        <TabsList>
          <TabsTrigger value="entries">Time entries</TabsTrigger>
          <TabsTrigger value="attendance">Attendance & reports</TabsTrigger>
        </TabsList>

        <TabsContent value="entries">
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {showUser ? <TableHead>User</TableHead> : null}
                  <TableHead>Project</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.data && entries.data.length > 0 ? (
                  entries.data.map((e) => (
                    <TableRow key={e.id}>
                      {showUser ? (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-6">
                              {e.user.avatarUrl ? (
                                <AvatarImage src={e.user.avatarUrl} alt="" />
                              ) : null}
                              <AvatarFallback className="text-[0.6rem]">
                                {initials(e.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{e.user.name}</span>
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell className="text-muted-foreground">
                        {e.client?.companyName ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate">
                        {e.task?.title ?? e.description ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {e.date}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {e.startTime ?? "—"}
                      </TableCell>
                      <TableCell>
                        <InvoiceBadge status={e.invoiceStatus} />
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatDuration(e.durationSeconds)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyRow
                    span={showUser ? 7 : 6}
                    text="No time logged yet. Add your first entry."
                  />
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <div className="mb-4">
            <TodayStatus current={current.data} />
          </div>
          <Card className="gap-0 py-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Check in</TableHead>
                  <TableHead>Check out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Day report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data && history.data.length > 0 ? (
                  history.data.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {istDateString(new Date(s.checkInAt))}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {new Date(s.checkInAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {s.checkOutAt ? (
                          new Date(s.checkOutAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        ) : (
                          <span className="text-success">On shift</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {s.report?.hoursWorked
                          ? `${s.report.hoursWorked}h`
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-[22rem] truncate text-muted-foreground">
                        {s.report?.summary ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyRow span={5} text="No shifts recorded yet." />
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <AddEntryDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

function TodayStatus({
  current,
}: {
  current:
    | { shift: { checkInAt: string | Date } | null; todayReport: unknown }
    | undefined;
}) {
  let text = "Not checked in today";
  let tone = "text-muted-foreground";
  if (current?.shift) {
    text = "On shift now";
    tone = "text-success";
  } else if (current?.todayReport) {
    text = "Today's report submitted";
    tone = "text-foreground";
  }
  return (
    <Card className="gap-0">
      <div className="flex items-center gap-3 px-5">
        <div className="flex size-9 items-center justify-center rounded-md bg-muted">
          <CalendarDays className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Today</p>
          <p className={cn("text-sm font-medium", tone)}>{text}</p>
        </div>
      </div>
    </Card>
  );
}

function AddEntryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(istDateString());
  const [startTime, setStartTime] = useState("");
  const [hours, setHours] = useState("1");
  const [invoiced, setInvoiced] = useState(false);

  const add = trpc.timesheet.add.useMutation({
    onSuccess: () => {
      utils.timesheet.entries.invalidate();
      utils.timesheet.summary.invalidate();
      onOpenChange(false);
      setDescription("");
      setHours("1");
      setStartTime("");
      setInvoiced(false);
      toast.success("Time entry added.");
    },
    onError: (e) => toast.error(e.message),
  });

  const hoursNum = Number(hours);
  const valid = description.trim().length > 0 && hoursNum > 0 && hoursNum <= 24;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add time entry</DialogTitle>
          <DialogDescription>
            Log work you&rsquo;ve done. Link it to a client or mission from the
            mission page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="te-desc">Description</Label>
          <Input
            id="te-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on?"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="te-date">Date</Label>
            <Input
              id="te-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="te-start">Start time</Label>
            <Input
              id="te-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="te-hours">Hours</Label>
          <Input
            id="te-hours"
            type="number"
            min={0}
            max={24}
            step={0.25}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={invoiced}
            onCheckedChange={(v) => setInvoiced(Boolean(v))}
          />
          Mark as invoiced
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || add.isPending}
            onClick={() =>
              add.mutate({
                description,
                date,
                startTime: startTime || undefined,
                hours: hoursNum,
                invoiceStatus: invoiced ? "invoiced" : "not_invoiced",
              })
            }
          >
            {add.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
