"use client";

import { ListChecks, CheckCircle2, Clock, FileCheck2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { MetricCard } from "@/components/app/metric-card";
import { BarList } from "@/components/app/bar-list";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { VERTICAL_LABELS } from "@/components/app/status-badge";
import { TASK_STATUSES } from "@/lib/constants";
import { initials, relativeTime } from "@/lib/format";

function CardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

export function ReportsView() {
  const query = trpc.report.data.useQuery();
  const dayReports = trpc.report.dayReports.useQuery();
  const checkIns = trpc.report.checkIns.useQuery();

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Reports & Workload"
        description="Throughput, workload, and what the team submitted."
      />
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="day-reports">
            Day reports
            {(dayReports.data?.length ?? 0) > 0 ? ` (${dayReports.data?.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="checkins">
            Check-ins
            {(checkIns.data?.length ?? 0) > 0 ? ` (${checkIns.data?.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {query.isLoading || !query.data ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <OverviewContent data={query.data} />
          )}
        </TabsContent>

        <TabsContent value="day-reports">
          <DayReportsTable rows={dayReports.data ?? []} loading={dayReports.isLoading} />
        </TabsContent>

        <TabsContent value="checkins">
          <CheckInsList rows={checkIns.data ?? []} loading={checkIns.isLoading} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function OverviewContent({ data }: { data: RouterOutputs["report"]["data"] }) {
  const { metrics, byVertical, byStatus, completedByDay, workload } = data;
  const maxDay = Math.max(1, ...completedByDay.map((d) => d.count));
  const verticalItems = Object.entries(byVertical)
    .map(([k, v]) => ({ label: VERTICAL_LABELS[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value);
  const statusItems = TASK_STATUSES.map((s) => ({
    label: s.label,
    value: byStatus[s.value] ?? 0,
  }));

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Open missions" value={metrics.totalOpen} icon={ListChecks} />
        <MetricCard
          label="Completed (7d)"
          value={metrics.completed7d}
          icon={CheckCircle2}
        />
        <MetricCard label="On shift now" value={metrics.activeShifts} icon={Clock} />
        <MetricCard
          label="Reports today"
          value={`${metrics.reportsToday}/${metrics.teamSize}`}
          icon={FileCheck2}
        />
      </div>

      <div className="mb-6">
        <CardShell title="Throughput — missions completed (14 days)">
          <div className="flex h-36 items-end gap-1.5">
            {completedByDay.map((d) => (
              <div
                key={d.date}
                className="group flex flex-1 flex-col items-center justify-end gap-1"
                title={`${d.date}: ${d.count} completed`}
              >
                <div
                  className="w-full rounded-t bg-foreground transition-colors group-hover:bg-foreground/80"
                  style={{
                    height: `${Math.max(4, (d.count / maxDay) * 100)}%`,
                  }}
                />
                <span className="text-[0.6rem] text-muted-foreground">
                  {d.date.slice(8)}
                </span>
              </div>
            ))}
          </div>
        </CardShell>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CardShell title="Work by vertical">
          <BarList items={verticalItems} />
        </CardShell>
        <CardShell title="Missions by status">
          <BarList items={statusItems} />
        </CardShell>
      </div>

      <Card className="gap-0 py-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold">Team workload</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Member</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">In progress</TableHead>
              <TableHead className="text-right">Done (7d)</TableHead>
              <TableHead className="text-right">Hours (7d)</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workload.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7">
                      {w.avatarUrl ? (
                        <AvatarImage src={w.avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="text-[0.65rem]">
                        {initials(w.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{w.name}</p>
                      {w.department ? (
                        <p className="text-xs text-muted-foreground">
                          {w.department}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {w.open}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {w.inProgress}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {w.done7d}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {w.hours7d}h
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {w.points}
                </TableCell>
                <TableCell>
                  {w.onShift ? (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="size-1.5 rounded-full bg-success" />
                      On shift
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Off</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function Who({
  user,
}: {
  user: { name: string; avatarUrl: string | null; department: string | null };
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className="size-7">
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
        <AvatarFallback className="text-[0.65rem]">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div>
        <p className="text-sm font-medium">{user.name}</p>
        {user.department ? (
          <p className="text-xs text-muted-foreground">{user.department}</p>
        ) : null}
      </div>
    </div>
  );
}

function DayReportsTable({
  rows,
  loading,
}: {
  rows: RouterOutputs["report"]["dayReports"];
  loading: boolean;
}) {
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Member</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>What they got done</TableHead>
            <TableHead>Blockers</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-10 text-center">
                <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                No day reports yet. Employees submit these when they check out.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Who user={r.user} />
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{r.date}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {r.hoursWorked ? `${r.hoursWorked}h` : "—"}
                </TableCell>
                <TableCell className="max-w-[26rem] text-sm">{r.summary}</TableCell>
                <TableCell className="max-w-[16rem] text-sm text-muted-foreground">
                  {r.blockers || "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function CheckInsList({
  rows,
  loading,
}: {
  rows: RouterOutputs["report"]["checkIns"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card className="py-12">
        <p className="text-center text-sm text-muted-foreground">
          No check-ins yet. The team logs these on the Daily check-in page.
        </p>
      </Card>
    );
  }
  return (
    <Card className="gap-0 py-0">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-3 p-4">
            <Avatar className="size-8 shrink-0">
              {r.user?.avatarUrl ? <AvatarImage src={r.user.avatarUrl} alt="" /> : null}
              <AvatarFallback className="text-xs">{initials(r.user?.name ?? "?")}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{r.user?.name ?? "Unknown"}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  · {format(new Date(r.createdAt), "dd MMM, HH:mm")} ({relativeTime(r.createdAt)})
                </span>
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-foreground/90">{r.content}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
