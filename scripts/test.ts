import { spawn } from "node:child_process";
import { checkTestDatabase } from "./test-database";

try {
  await checkTestDatabase();
  const args = process.argv.slice(2);
  const child = spawn(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      args[0] === "--watch" ? "watch" : "run",
      ...args.filter((arg) => arg !== "--watch"),
    ],
    { stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Test setup failed.");
  process.exitCode = 1;
}
