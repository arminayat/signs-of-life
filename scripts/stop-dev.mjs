import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));

function output(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8" });
  } catch (error) {
    if (error.status === 1) return "";
    throw error;
  }
}

const processes = new Map(
  output("ps", ["-axo", "pid=,ppid=,command="])
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map(([, pid, parent, command]) => [
      Number(pid),
      { parent: Number(parent), command },
    ]),
);
const listeners = output("lsof", [
  "-nP",
  "-t",
  "-iTCP:5173",
  "-iTCP:8787",
  "-sTCP:LISTEN",
])
  .trim()
  .split("\n")
  .map(Number)
  .filter(Boolean);
const roots = new Set();

for (const listener of listeners) {
  const cwd = output("lsof", ["-a", "-p", String(listener), "-d", "cwd", "-Fn"])
    .split("\n")
    .find((line) => line.startsWith("n"))
    ?.slice(1);
  if (!cwd || realpathSync(cwd) !== root) continue;

  let pid = listener;
  let devRoot;
  while (processes.has(pid)) {
    const { parent, command } = processes.get(pid);
    if (/(?:^|\s)\S*\/pnpm dev(?::(?:api|web|worker))?(?:\s|$)/.test(command)) {
      devRoot = pid;
    }
    pid = parent;
  }
  if (devRoot) roots.add(devRoot);
}

if (!roots.size) {
  console.log("No Signs of Life dev server is running.");
  process.exit(0);
}

function descendants(rootPid) {
  const found = [];
  function visit(pid) {
    for (const [child, { parent }] of processes) {
      if (parent === pid) visit(child);
    }
    found.push(pid);
  }
  visit(rootPid);
  return found;
}

const targets = new Set([...roots].flatMap(descendants));
for (const pid of targets) {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
console.log("Stopped the Signs of Life dev server.");
