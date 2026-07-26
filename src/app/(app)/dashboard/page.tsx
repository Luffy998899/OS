import type { Metadata } from "next";
import Link from "next/link";
import {
  ListChecks,
  Activity,
  Eye,
  CheckCircle2,
  Trophy,
  Users,
  Clock,
  Sparkles,
  Gamepad2,
  ScrollText,
  ArrowRight,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getApi } from "@/server/caller";
import { PageHeader } from "@/components/app/page-header";
import { MetricCard } from "@/components/app/metric-card";
import { MissionRow } from "@/components/tasks/mission-row";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TASK_STATUSES } from "@/lib/constants";
import { initials, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

function CardShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const api = await getApi();
  const data = await api.dashboard.overview();
  const firstName = user?.name.split(" ")[0] ?? "there";
  const { personal, myTasks, dueSoon, admin } = data;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${firstName}`}
        description="Your floor at a glance — missions, attendance, and what needs you today."
      >
        <ButtonLink href="/leaderboard" variant="outline">
          <Trophy className="size-4" />
          Leaderboard
        </ButtonLink>
        <ButtonLink href="/workspace">
          <Gamepad2 className="size-4" />
          Open Gamified Workspace
        </ButtonLink>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Open missions"
          value={personal.assignedOpen}
          icon={ListChecks}
        />
        <MetricCard
          label="In progress"
          value={personal.inProgress}
          icon={Activity}
        />
        <MetricCard label="In review" value={personal.inReview} icon={Eye} />
        <MetricCard
          label="Done this week"
          value={personal.completedThisWeek}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CardShell
            title="Your missions"
            action={
              <Link
                href="/my-work"
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                View all <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            {myTasks.length > 0 ? (
              <div className="divide-y divide-border">
                {myTasks.map((t) => (
                  <MissionRow key={t.id} task={t} href="/my-work" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No open missions. Enjoy the calm — or grab one from the board.
                </p>
                <ButtonLink href="/bounties" variant="outline" size="sm">
                  <ScrollText className="size-3.5" />
                  Bounty Board
                </ButtonLink>
              </div>
            )}
          </CardShell>
        </div>

        <div className="space-y-6">
          <Card className="gap-0">
            <div className="px-5">
              <p className="text-sm text-muted-foreground">Your standing</p>
            </div>
            <div className="flex items-end justify-between px-5 pt-2">
              <div>
                <p className="font-display text-3xl font-semibold tabular-nums">
                  {formatNumber(personal.points)}
                </p>
                <p className="text-xs text-muted-foreground">points earned</p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-semibold tabular-nums">
                  #{personal.rank || "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  of {personal.teamSize}
                </p>
              </div>
            </div>
          </Card>

          <CardShell title="Due soon">
            {dueSoon.length > 0 ? (
              <div className="divide-y divide-border">
                {dueSoon.map((t) => (
                  <MissionRow key={t.id} task={t} href="/my-work" />
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing due soon.
              </p>
            )}
          </CardShell>
        </div>
      </div>

      {admin ? (
        <div className="mt-8">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <h2 className="font-heading text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Floor overview
            </h2>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="On shift now"
              value={admin.activeShifts}
              icon={Clock}
            />
            <MetricCard
              label="Reports today"
              value={admin.submittedReportsToday}
              icon={CheckCircle2}
            />
            <MetricCard
              label="Pending reviews"
              value={admin.pendingReviews}
              hint="AI drafts awaiting approval"
              icon={Eye}
            />
            <MetricCard
              label="Open missions"
              value={admin.openMissions}
              icon={ListChecks}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CardShell title="Work by status">
              <div className="space-y-3 p-4">
                {(() => {
                  const max = Math.max(
                    1,
                    ...TASK_STATUSES.map((s) => admin.byStatus[s.value] ?? 0),
                  );
                  return TASK_STATUSES.map((s) => {
                    const count = admin.byStatus[s.value] ?? 0;
                    return (
                      <div key={s.value} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-xs text-muted-foreground">
                          {s.label}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-foreground"
                            style={{ width: `${(count / max) * 100}%` }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right text-xs font-medium tabular-nums">
                          {count}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </CardShell>

            <CardShell
              title="Top performers"
              action={
                <Link
                  href="/leaderboard"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Leaderboard <ArrowRight className="size-3.5" />
                </Link>
              }
            >
              <ol className="divide-y divide-border">
                {admin.topPerformers.map((p, i) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span className="w-5 text-center font-mono text-sm text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <Avatar className="size-7">
                      {p.avatarUrl ? (
                        <AvatarImage src={p.avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="text-[0.65rem]">
                        {initials(p.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      {p.department ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {p.department}
                        </p>
                      ) : null}
                    </div>
                    <span className="flex items-center gap-1 text-sm font-medium tabular-nums">
                      <Trophy className="size-3.5 text-muted-foreground" />
                      {formatNumber(p.points)}
                    </span>
                  </li>
                ))}
              </ol>
            </CardShell>
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <Card className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="px-5">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <p className="text-sm font-medium">Your team</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Jump into the virtual office to see who&rsquo;s around and pick
                up missions.
              </p>
            </div>
            <div className="px-5">
              <ButtonLink href="/workspace" variant="outline">
                <Gamepad2 className="size-4" />
                Enter the office
              </ButtonLink>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
