import "server-only";
import { appRouter } from "./routers/_app";
import { createCallerFactory, createContext } from "./trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Server-side tRPC caller for use inside React Server Components and server
 * actions. Shares the same context (auth, db) as the HTTP endpoint.
 */
export async function getApi() {
  return createCaller(await createContext());
}
