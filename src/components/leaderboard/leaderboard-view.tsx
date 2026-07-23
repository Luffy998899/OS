"use client";

import { Trophy, Gift, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc/client";
import { initials, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function LeaderboardView() {
  const standings = trpc.leaderboard.standings.useQuery();
  const rewardsQ = trpc.leaderboard.rewards.useQuery();
  const utils = trpc.useUtils();

  const redeem = trpc.leaderboard.redeem.useMutation({
    onSuccess: () => {
      utils.leaderboard.rewards.invalidate();
      utils.leaderboard.standings.invalidate();
      utils.me.invalidate();
      toast.success("Redeemed — your reward is pending fulfilment.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="Standings"
        title="Leaderboard"
        description="Points earned from completed missions. Spend them on rewards."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="gap-0 py-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-heading text-sm font-semibold">Rankings</h2>
            </div>
            {standings.isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ol className="divide-y divide-border">
                {standings.data?.map((u) => (
                  <li
                    key={u.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      u.isMe && "bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                        u.rank === 1
                          ? "bg-foreground text-background"
                          : u.rank <= 3
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {u.rank}
                    </span>
                    <Avatar className="size-9">
                      {u.avatarUrl ? (
                        <AvatarImage src={u.avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback>{initials(u.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {u.name}
                        {u.isMe ? (
                          <Badge variant="secondary">You</Badge>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.title ?? u.department ?? ""}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                      <Trophy className="size-4 text-muted-foreground" />
                      {formatNumber(u.points)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="gap-0">
            <div className="flex items-center justify-between px-5">
              <div className="flex items-center gap-2">
                <Gift className="size-4 text-muted-foreground" />
                <p className="text-sm font-medium">Your balance</p>
              </div>
            </div>
            <div className="px-5 pt-1">
              <p className="font-display text-3xl font-semibold tabular-nums">
                {formatNumber(rewardsQ.data?.points ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">points to spend</p>
            </div>
          </Card>

          <Card className="gap-0 py-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-heading text-sm font-semibold">Rewards</h2>
            </div>
            <div className="divide-y divide-border">
              {rewardsQ.data?.rewards.map((r) => {
                const affordable =
                  (rewardsQ.data?.points ?? 0) >= r.costPoints;
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{r.name}</p>
                      {r.description ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {r.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium tabular-nums text-muted-foreground">
                        {formatNumber(r.costPoints)} pts
                      </p>
                      <Button
                        size="xs"
                        variant={affordable ? "default" : "outline"}
                        disabled={!affordable || redeem.isPending}
                        onClick={() => redeem.mutate({ rewardId: r.id })}
                        className="mt-1"
                      >
                        Redeem
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {rewardsQ.data && rewardsQ.data.redemptions.length > 0 ? (
            <Card className="gap-0 py-0">
              <div className="border-b border-border px-4 py-3">
                <h2 className="font-heading text-sm font-semibold">
                  Your redemptions
                </h2>
              </div>
              <ul className="divide-y divide-border">
                {rewardsQ.data.redemptions.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Check className="size-3.5 text-success" />
                      {r.reward.name}
                    </span>
                    <Badge variant="outline" className="capitalize">
                      {r.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
