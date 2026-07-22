import { router, publicProcedure, protectedProcedure } from "../trpc";
import { notificationRouter } from "./notification";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "auxa" })),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
