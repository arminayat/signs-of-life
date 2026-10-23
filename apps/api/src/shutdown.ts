import type { Server } from "node:http";

export function gracefulShutdown(
  server: Pick<Server, "close" | "closeAllConnections">,
  closeDatabase: () => Promise<void>,
  exit: (code: number) => void = process.exit,
) {
  let shutdown: Promise<void> | undefined;
  return () =>
    (shutdown ??= (async () => {
      // Keep the database available until requests finish. A forced drain is
      // bounded as well, including a database close that cannot complete.
      const forceExit = setTimeout(() => exit(1), 30_000);
      const forceDrain = setTimeout(() => server.closeAllConnections(), 25_000);
      try {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        clearTimeout(forceDrain);
        await closeDatabase();
        exit(0);
      } catch {
        console.error(JSON.stringify({ event: "api_shutdown_failed" }));
        exit(1);
      } finally {
        clearTimeout(forceDrain);
        clearTimeout(forceExit);
      }
    })());
}
