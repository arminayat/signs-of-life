import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("cleans a started cluster when SIGTERM arrives during setup", async () => {
  const folder = await mkdtemp(join(tmpdir(), "sol-bootstrap-probe-"));
  const bin = join(folder, "bin");
  const temporary = join(folder, "temporary");
  await mkdir(bin);
  await mkdir(temporary);
  try {
    const commands = {
      initdb: "exit 0",
      createdb: "exit 0",
      pnpm: "exec sleep 30",
      pg_ctl: `
for arg do
  case "$arg" in
    start)
      touch "$BOOTSTRAP_PROBE_DIR/running"
      kill -TERM "$PPID"
      sleep 0.1
      exit 0 ;;
    status) test -f "$BOOTSTRAP_PROBE_DIR/running" && exit 0; exit 3 ;;
    stop) rm "$BOOTSTRAP_PROBE_DIR/running"; exit 0 ;;
  esac
done
exit 0`,
    };
    for (const [name, script] of Object.entries(commands))
      await writeFile(join(bin, name), `#!/bin/sh\n${script}\n`, {
        mode: 0o700,
      });
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/check-isolated.ts"],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          TMPDIR: temporary,
          BOOTSTRAP_PROBE_DIR: folder,
        },
        stdio: "pipe",
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const result = await new Promise<{
      code: number | null;
      signal: string | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    expect(result, output).toEqual({ code: 1, signal: null });
    expect(await readdir(folder)).not.toContain("running");
    expect(
      (await readdir(temporary)).filter((name) =>
        name.startsWith("signs-of-life-check-"),
      ),
    ).toEqual([]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
