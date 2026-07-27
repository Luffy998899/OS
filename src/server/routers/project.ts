import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure, publicProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isAiEnabled, callClaude } from "@/lib/ai/client";

// The developer city. Three structures:
//   pipeline  — the always-on tower; every floor is a project being built
//   complete  — the finished tower (10 floors), rearranged by niche monthly
//   tools     — the bungalow of internal tools
const buildingEnum = z.enum(["pipeline", "complete", "tools"]);

const projectInclude = {
  client: { select: { id: true, companyName: true } },
  tasks: { select: { id: true, status: true } },
} as const;

function parseBoard(raw: string): { label: string; value: string }[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.map((e) => ({ label: String(e.label ?? ""), value: String(e.value ?? "") }))
      : [];
  } catch {
    return [];
  }
}

function progressOf(tasks: { status: string }[]): { done: number; total: number } {
  return {
    done: tasks.filter((t) => t.status === "done").length,
    total: tasks.length,
  };
}

export const projectRouter = router({
  /** The whole city at a glance — what every tower floor holds. */
  city: protectedProcedure.query(async ({ ctx }) => {
    const projects = await ctx.db.project.findMany({
      include: projectInclude,
      orderBy: [{ floor: "asc" }, { createdAt: "asc" }],
    });
    const shape = (p: (typeof projects)[number]) => ({
      id: p.id,
      name: p.name,
      buildingKey: p.buildingKey,
      floor: p.floor,
      niche: p.niche,
      status: p.status,
      deadline: p.deadline,
      repoUrl: p.repoUrl,
      siteUrl: p.siteUrl,
      auditStatus: p.auditStatus,
      auditNote: p.auditNote,
      toolDesc: p.toolDesc,
      client: p.client,
      progress: progressOf(p.tasks),
      openTasks: p.tasks.filter((t) => t.status !== "done").length,
    });
    return {
      pipeline: projects.filter((p) => p.buildingKey === "pipeline").map(shape),
      complete: projects.filter((p) => p.buildingKey === "complete").map(shape),
      tools: projects.filter((p) => p.buildingKey === "tools").map(shape),
    };
  }),

  /** One floor, fully furnished: tasks, the data board, share link, requests. */
  floor: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const p = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          client: { select: { id: true, companyName: true, email: true, phone: true } },
          tasks: {
            orderBy: [{ status: "asc" }, { priority: "desc" }],
            include: { assignee: { select: { id: true, name: true } } },
          },
          requests: { orderBy: { createdAt: "desc" }, take: 30 },
        },
      });
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...p,
        dataBoard: parseBoard(p.dataBoard),
        progress: progressOf(p.tasks),
      };
    }),

  create: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        name: z.string().min(2),
        buildingKey: buildingEnum.default("pipeline"),
        clientId: z.string().optional(),
        niche: z.string().optional(),
        deadline: z.date().optional(),
        repoUrl: z.string().optional(),
        siteUrl: z.string().optional(),
        toolDesc: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const top = await ctx.db.project.findFirst({
        where: { buildingKey: input.buildingKey },
        orderBy: { floor: "desc" },
        select: { floor: true },
      });
      return ctx.db.project.create({
        data: {
          name: input.name.trim(),
          buildingKey: input.buildingKey,
          floor: (top?.floor ?? 0) + 1,
          clientId: input.clientId || null,
          niche: input.niche?.trim() || null,
          deadline: input.deadline,
          repoUrl: input.repoUrl?.trim() || null,
          siteUrl: input.siteUrl?.trim() || null,
          toolDesc: input.toolDesc?.trim() || null,
        },
      });
    }),

  update: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        niche: z.string().nullable().optional(),
        deadline: z.date().nullable().optional(),
        repoUrl: z.string().nullable().optional(),
        siteUrl: z.string().nullable().optional(),
        toolDesc: z.string().nullable().optional(),
        auditStatus: z.enum(["unaudited", "pass", "warn", "fail"]).optional(),
        auditNote: z.string().nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.project.update({ where: { id }, data });
    }),

  /** Topping-out: a finished pipeline floor moves into the completed tower. */
  complete: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const p = await ctx.db.project.findUnique({ where: { id: input.id } });
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      if (p.buildingKey !== "pipeline") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pipeline floors top out." });
      }
      const top = await ctx.db.project.findFirst({
        where: { buildingKey: "complete" },
        orderBy: { floor: "desc" },
        select: { floor: true },
      });
      return ctx.db.project.update({
        where: { id: p.id },
        data: {
          buildingKey: "complete",
          status: "complete",
          floor: (top?.floor ?? 0) + 1,
        },
      });
    }),

  setDataBoard: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        id: z.string(),
        entries: z.array(z.object({ label: z.string(), value: z.string() })).max(40),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.project.update({
        where: { id: input.id },
        data: { dataBoard: JSON.stringify(input.entries) },
      }),
    ),

  /**
   * The monthly shuffle: the completed tower re-stacks its floors by niche so
   * related sites sit together. Uses Claude when configured; the deterministic
   * fallback groups by niche alphabetically, biggest group first.
   */
  rearrange: permissionProcedure(PERMISSIONS.TASKS_ASSIGN).mutation(async ({ ctx }) => {
    const complete = await ctx.db.project.findMany({
      where: { buildingKey: "complete" },
      orderBy: { floor: "asc" },
    });
    if (complete.length === 0) return { ok: true, order: [] };

    let ordered = [...complete];
    if (isAiEnabled()) {
      const listing = complete
        .map((p) => `${p.id} :: ${p.name} :: niche=${p.niche ?? "unknown"}`)
        .join("\n");
      const reply = await callClaude(
        "You arrange a 10-floor tower of completed client websites so similar niches are adjacent. Reply ONLY with the ids, one per line, ground floor first.",
        [{ role: "user", content: listing }],
        400,
      );
      if (reply) {
        const ids = reply.split("\n").map((l) => l.trim()).filter(Boolean);
        const byId = new Map(complete.map((p) => [p.id, p]));
        const aiOrdered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof complete;
        if (aiOrdered.length === complete.length) ordered = aiOrdered;
      }
    }
    if (ordered === complete) {
      const groups = new Map<string, typeof complete>();
      for (const p of complete) {
        const key = (p.niche ?? "zz-unknown").toLowerCase();
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      ordered = [...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .flatMap(([, g]) => g.sort((x, y) => x.name.localeCompare(y.name)));
    }

    await ctx.db.$transaction(
      ordered.map((p, i) =>
        ctx.db.project.update({ where: { id: p.id }, data: { floor: i + 1 } }),
      ),
    );
    return { ok: true, order: ordered.map((p) => p.id) };
  }),

  /**
   * The AI caretaker's sweep: is each website actually finished? A completed
   * floor with open tasks fails, one with no live site link warns.
   */
  auditSweep: permissionProcedure(PERMISSIONS.TASKS_ASSIGN).mutation(async ({ ctx }) => {
    const complete = await ctx.db.project.findMany({
      where: { buildingKey: "complete" },
      include: { tasks: { select: { status: true } } },
    });
    let flagged = 0;
    for (const p of complete) {
      const open = p.tasks.filter((t) => t.status !== "done").length;
      const status = open > 0 ? "fail" : !p.siteUrl ? "warn" : "pass";
      const note =
        open > 0
          ? `${open} open task${open === 1 ? "" : "s"} — the site isn't fully complete.`
          : !p.siteUrl
            ? "No live site link on the floor."
            : "Task list clear and site linked.";
      if (status !== "pass") flagged++;
      await ctx.db.project.update({
        where: { id: p.id },
        data: { auditStatus: status, auditNote: note },
      });
    }
    return { ok: true, checked: complete.length, flagged };
  }),

  remove: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction([
        ctx.db.task.updateMany({ where: { projectId: input.id }, data: { projectId: null } }),
        ctx.db.project.delete({ where: { id: input.id } }),
      ]);
      return { ok: true };
    }),

  // ---- the client share link -------------------------------------------

  /** What the share page shows. Deliberately excludes the private data board. */
  byToken: publicProcedure
    .input(z.object({ token: z.string().min(8) }))
    .query(async ({ ctx, input }) => {
      const p = await ctx.db.project.findUnique({
        where: { shareToken: input.token },
        include: {
          client: { select: { companyName: true } },
          tasks: { select: { status: true } },
          requests: { orderBy: { createdAt: "asc" }, take: 50 },
        },
      });
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        name: p.name,
        clientName: p.client?.companyName ?? null,
        buildingKey: p.buildingKey,
        floor: p.floor,
        status: p.status,
        deadline: p.deadline,
        siteUrl: p.siteUrl,
        progress: progressOf(p.tasks),
        requests: p.requests.map((r) => ({
          id: r.id,
          author: r.author,
          body: r.body,
          reply: r.reply,
          status: r.status,
          createdAt: r.createdAt,
        })),
      };
    }),

  /** A client drops a request onto their floor; the agent acknowledges. */
  requestTask: publicProcedure
    .input(
      z.object({
        token: z.string().min(8),
        author: z.string().min(1).max(80),
        body: z.string().min(3).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const p = await ctx.db.project.findUnique({
        where: { shareToken: input.token },
        select: { id: true, name: true },
      });
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });

      const today = await ctx.db.clientRequest.count({
        where: {
          projectId: p.id,
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
      });
      if (today >= 20) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "This floor has had a lot of requests today — please try again tomorrow.",
        });
      }

      let reply: string | null = null;
      if (isAiEnabled()) {
        reply = await callClaude(
          `You are the on-floor agent for the project "${p.name}". A client just dropped a request. Acknowledge it warmly in 1-2 sentences, say the team will triage it, and ask one clarifying question if the request is vague. No promises on timelines.`,
          [{ role: "user", content: input.body }],
          300,
        );
      }
      reply =
        reply ??
        "Got it — logged on the floor. The team will triage this and it will show up in the project's task list once approved.";

      const req = await ctx.db.clientRequest.create({
        data: {
          projectId: p.id,
          author: input.author.trim(),
          body: input.body.trim(),
          reply,
        },
      });
      return { id: req.id, reply };
    }),

  /** A manager turns a client request into a real (pending-review) task. */
  convertRequest: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const req = await ctx.db.clientRequest.findUnique({
        where: { id: input.id },
        include: { project: { select: { id: true, name: true, clientId: true } } },
      });
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.status === "converted") return { ok: true, taskId: req.taskId };

      const devRoom = await ctx.db.room.findUnique({ where: { key: "developer" } });
      const task = await ctx.db.task.create({
        data: {
          title: req.body.length > 80 ? `${req.body.slice(0, 77)}…` : req.body,
          description: `Client request from ${req.author} on floor "${req.project.name}":\n\n${req.body}`,
          vertical: "website-dev",
          skill: "dev",
          source: "manual",
          approvalStatus: "approved",
          projectId: req.project.id,
          clientId: req.project.clientId,
          roomId: devRoom?.id ?? null,
          createdById: ctx.user.id,
        },
      });
      await ctx.db.clientRequest.update({
        where: { id: req.id },
        data: { status: "converted", taskId: task.id },
      });
      return { ok: true, taskId: task.id };
    }),

  dismissRequest: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.clientRequest.update({ where: { id: input.id }, data: { status: "dismissed" } }),
    ),
});
