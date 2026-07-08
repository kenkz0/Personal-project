const { spawn } = require("node:child_process");

const children = [];
let shuttingDown = false;

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) shutdown(code || 1);
  });
  return child;
}

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("python", ["-u", "tools/pc_cover_api.py"]);
start(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"]);
