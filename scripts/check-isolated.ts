import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";

// An opt-in, disposable cluster. The child test runner receives its explicit
// test URL; installation database credentials are never reused.
let child: ReturnType<typeof spawn> | undefined;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    interrupted = true;
    child?.kill(signal);
  });
const folder = await mkdtemp(join(tmpdir(), "signs-of-life-check-"));
const data = join(folder, "data");
let startAttempted = false;
let stage = "checking PostgreSQL server tools";
const run = promisify(execFile);
async function setup(name: string, args: string[]) {
  if (interrupted) throw new Error("Interrupted during setup");
  await run(name, args);
  if (interrupted) throw new Error("Interrupted during setup");
}
try {
  for (const name of ["initdb", "pg_ctl", "createdb"])
    await setup(name, ["--version"]);
  stage = "reserving a loopback port";
  const server = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("No test port"));
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
  stage = "initializing the temporary cluster";
  await setup("initdb", [
    "-D",
    data,
    "-U",
    "test_runner",
    "--auth=trust",
    "--no-locale",
  ]);
  stage = "starting the temporary cluster";
  startAttempted = true;
  await setup("pg_ctl", [
    "-D",
    data,
    "-l",
    join(folder, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`,
    "-w",
    "start",
  ]);
  stage = "creating the isolated database";
  await setup("createdb", [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "test_runner",
    "signs_of_life_test",
  ]);
  stage = "running checks";
  child = spawn("pnpm", ["check"], {
    stdio: "inherit",
    env: {
      ...process.env,
      TEST_DATABASE_URL: `postgres://test_runner@127.0.0.1:${port}/signs_of_life_test`,
    },
  });
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child!.once("error", reject);
    child!.once("exit", (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(
    `Isolated check failed while ${stage}: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
  console.error(
    "Use PostgreSQL 17+ server tools on PATH (client-only installations are insufficient) and allow local loopback sockets, or supply a running local _test database to pnpm check. Installation credentials were not changed.",
  );
  process.exitCode = 1;
} finally {
  try {
    if (startAttempted) {
      let running = false;
      try {
        await run("pg_ctl", ["-D", data, "status"]);
        running = true;
      } catch (error) {
        // pg_ctl status 3 means no server. Preserve the directory on any
        // unexpected status rather than deleting a potentially active cluster.
        if ((error as { code?: number }).code !== 3) throw error;
      }
      if (running)
        await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    }
    await rm(folder, { recursive: true, force: true });
  } catch {
    console.error(
      `Temporary PostgreSQL cleanup failed. Stop the cluster at ${data} before removing ${folder}.`,
    );
    process.exitCode = 1;
  }
}
