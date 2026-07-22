import { z } from "zod";
import { router, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { planMissions } from "@/lib/ai/plan";

export const assignRouter = router({
  aiStatus: permissionProcedure(PERMISSIONS.TASKS_ASSIGN).query(() => ({
    enabled: !!process.env.ANTHROPIC_API_KEY,
  })),

  plan: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ prompt: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const roster = await ctx.db.user.findMany({
        where: { status: { not: "suspended" } },
        select: {
          id: true,
          name: true,
          department: true,
          role: { select: { name: true } },
        },
      });
      return planMissions(
        input.prompt,
        roster.map((r) => ({
          id: r.id,
          name: r.name,
          department: r.department,
          role: r.role.name,
        })),
      );
    }),
});
