import { router, publicProcedure, protectedProcedure } from "../trpc";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "auxa" })),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
});

export type AppRouter = typeof appRouter;
