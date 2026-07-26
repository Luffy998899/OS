"use client";

import { Gamepad2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { BountyBoardPanel } from "./bounty-board";
import { SkillTreePanel } from "./skill-tree";

export function BountiesView() {
  return (
    <>
      <PageHeader
        eyebrow="Open work"
        title="Bounty Board"
        description="Unclaimed missions anyone eligible can grab. Urgent work pays a bonus on top of its base XP, and your craft levels decide what you can take."
      >
        <ButtonLink href="/workspace" variant="outline">
          <Gamepad2 className="size-4" />
          Walk to the board
        </ButtonLink>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="gap-3">
            <div className="px-4">
              <BountyBoardPanel />
            </div>
          </Card>
        </div>
        <div>
          <Card className="gap-3">
            <div className="px-4">
              <h2 className="font-heading text-sm font-semibold">What you can claim</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Craft levels gate the board. Finish missions in a craft to raise it.
              </p>
            </div>
            <div className="px-4">
              <SkillTreePanel compact />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
