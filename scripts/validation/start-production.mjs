import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (!existsSync(".next/standalone/server.js")) throw new Error("Build the standalone production server before validation");
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
const args = [".next/standalone/server.js"];
const server = spawn(process.execPath, args, {
  env: { ...process.env, HOSTNAME: "127.0.0.1" }, stdio: "inherit",
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => { process.exitCode = code ?? 1; });
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
