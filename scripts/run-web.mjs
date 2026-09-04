#!/usr/bin/env node
// Starts the Next dev server for `npm run dev`.
//
// Next already steps to 3001 when 3000 is taken, but it cannot tell a stale
// server of ours from someone else's project -- so a crashed run leaves 3000
// held and every later run drifts one port further from the only one Google's
// redirect works with. Claiming the port first fixes that: ours gets reclaimed,
// anything else is left alone.

import { spawn } from "node:child_process";

import { claimPort } from "./lib/ports.mjs";
import { repoRoot } from "./lib/python.mjs";

// The backend sends the browser here after the Google callback, and .env pins
// FRONTEND_URL to it.
const CANONICAL_PORT = 3000;

const isWindows = process.platform === "win32";

async function resolvePort() {
  const preferred = Number(process.env.PORT) || CANONICAL_PORT;
  // `npm run dev` already claimed both ports and told the backend about this
  // one. Claiming it again here would only find our own reservation.
  if (process.env.HITRENDY_PORTS_RESOLVED) return preferred;

  const { port } = await claimPort({ preferred, label: "web" });

  if (port !== CANONICAL_PORT) {
    console.warn(`\n[web] ${CANONICAL_PORT} ocupado, sirviendo en ${port}.`);
    console.warn("[web] El login con Google no funcionará aquí: el backend");
    console.warn(`[web] devuelve el navegador a FRONTEND_URL (puerto ${CANONICAL_PORT}).\n`);
  }

  return port;
}

async function main() {
  const port = await resolvePort();

  console.log(`[web] http://localhost:${port}`);

  const child = spawn(
    isWindows ? "npm.cmd" : "npm",
    ["run", "dev", "-w", "starter/web"],
    {
      cwd: repoRoot,
      env: { ...process.env, PORT: String(port) },
      stdio: "inherit",
    }
  );

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }

  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`[web] no se pudo arrancar Next: ${error.message}`);
      resolve(1);
    });
  });
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`[web] ${error.message}`);
    process.exitCode = 1;
  }
);
