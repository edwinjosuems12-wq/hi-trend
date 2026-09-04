#!/usr/bin/env node
// Single entry point for `npm run dev`.
//
// The three processes are not independent. The web proxies /api/v1 to the API
// port, and after the Google callback the API sends the browser back to the web
// port. A fallback port is only usable if all three agree on it, and no
// process-runner can arrange that: each command resolves its own ports, after
// the others have already committed to theirs. So the ports are resolved once,
// here, and passed down.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { claimPort } from "./lib/ports.mjs";
import { envFile, repoRoot } from "./lib/python.mjs";

// The only pair where Google sign-in completes end to end: Google has
// http://localhost:8000/api/v1/auth/google/callback registered as the redirect,
// and the callback hands the browser to http://localhost:3000.
const CANONICAL_API = 8000;
const CANONICAL_WEB = 3000;

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

const STYLE = {
  web: "\u001b[36m",
  api: "\u001b[35m",
  images: "\u001b[33m",
  warn: "\u001b[33m",
  reset: "\u001b[0m",
};

function readEnvFile() {
  if (!existsSync(envFile)) return {};
  const values = {};
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  return values;
}

function warn(lines) {
  for (const line of lines) console.log(`${STYLE.warn}[dev] ${line}${STYLE.reset}`);
}

/**
 * Environment the children need to agree on the ports we actually got.
 *
 * The ports themselves are always passed down -- the web proxy has to be told
 * where the API ended up, whatever port that is. The values .env owns are a
 * different matter: on the canonical pair they are left exactly as written, and
 * only a fallback rewrites them, as far as it must and no further.
 */
function sharedEnv({ apiPort, webPort }) {
  const fileValues = readEnvFile();
  const shared = {
    HITRENDY_PORTS_RESOLVED: "1",
    BACKEND_PORT: String(apiPort),
    PORT: String(webPort),
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}/api/v1`,
  };

  if (webPort !== CANONICAL_WEB) {
    const frontendUrl = `http://localhost:${webPort}`;
    shared.FRONTEND_URL = frontendUrl;

    // The backend refuses to start when Google sign-in is configured and
    // FRONTEND_URL is missing from ALLOWED_ORIGINS (app/core/config.py). Moving
    // the frontend without widening the origin list would trade a broken login
    // for a backend that will not boot at all.
    const origins = (fileValues.ALLOWED_ORIGINS || `http://localhost:${CANONICAL_WEB}`)
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (!origins.includes(frontendUrl)) origins.push(frontendUrl);
    shared.ALLOWED_ORIGINS = origins.join(",");
  }

  // Left alone on the canonical port: that value is what Google has registered,
  // and rewriting it would be the one way to break a flow that works. Off it,
  // pointing at the live port turns a dead-connection page into Google's own
  // redirect_uri_mismatch, which at least names the problem.
  if (apiPort !== CANONICAL_API && fileValues.GOOGLE_REDIRECT_URI) {
    shared.GOOGLE_REDIRECT_URI = fileValues.GOOGLE_REDIRECT_URI.replace(
      `:${CANONICAL_API}`,
      `:${apiPort}`
    );
  }

  return shared;
}

const children = new Map();
let shuttingDown = false;

// How long a child gets to stop on its own before it is killed outright.
const SHUTDOWN_GRACE_MS = 5000;

function stopChild(child, signalName) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (isWindows) {
    // spawnSync, not spawn: a failed spawn emits an 'error' event, and an
    // unhandled one here would take the orchestrator down mid-shutdown and
    // orphan every child it had not signalled yet.
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  // Negative pid: the whole group. `npm run` execs its own children, and
  // signalling only npm leaves next-server and uvicorn holding their ports --
  // exactly the stale listeners this launcher then has to reclaim next run.
  try {
    process.kill(-child.pid, signalName);
  } catch {
    // Group already gone.
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.keys()) stopChild(child, "SIGTERM");

  // Pressing Ctrl-C again cannot help: the children run in their own process
  // groups, so the terminal's signal reaches this process and nothing else. If
  // SIGTERM is not enough -- a stuck migration, a request that will not close
  // -- this is the only thing left that frees the ports they hold.
  const escalation = setTimeout(() => {
    for (const child of children.keys()) stopChild(child, "SIGKILL");
  }, SHUTDOWN_GRACE_MS);
  escalation.unref();
}

// Progress output (pip, webpack) redraws a single line with \r and may never
// send a newline, so \r ends a line too. The cap is the backstop for output
// that does neither: without it a long-running spinner grows one string until
// the process runs out of memory.
const MAX_BUFFERED_CHARS = 64 * 1024;

function pipe(stream, name) {
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r\n|[\r\n]/);
    buffered = lines.pop() ?? "";
    if (buffered.length > MAX_BUFFERED_CHARS) {
      lines.push(buffered);
      buffered = "";
    }
    for (const line of lines) {
      console.log(`${STYLE[name]}[${name}]${STYLE.reset} ${line}`);
    }
  });
  stream.on("end", () => {
    if (buffered) console.log(`${STYLE[name]}[${name}]${STYLE.reset} ${buffered}`);
  });
}

function start({ name, args, env, critical }) {
  const child = spawn(npm, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: !isWindows,
  });

  children.set(child, { name, critical });
  pipe(child.stdout, name);
  pipe(child.stderr, name);

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;

    if (code === 0) {
      console.log(`${STYLE[name]}[${name}]${STYLE.reset} terminó.`);
    } else {
      warn([`${name} terminó con ${signal ? `señal ${signal}` : `código ${code}`}.`]);
    }

    // A dead API behind a live web server is what makes a broken backend look
    // like a rejected password. If something essential stops, the whole stack
    // stops, and the reason stays on screen.
    if (critical) {
      if (code !== 0) warn(["Se detiene el resto del stack."]);
      process.exitCode = code === 0 ? 0 : (code ?? 1);
      shutdown();
    } else if (code !== 0) {
      warn([`${name} no es esencial; web y api siguen corriendo.`]);
    }
  });

  return child;
}

async function main() {
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, shutdown);

  const api = await claimPort({ preferred: CANONICAL_API, label: "api" });
  const web = await claimPort({ preferred: CANONICAL_WEB, label: "web" });

  console.log(`[dev] api  -> http://127.0.0.1:${api.port}`);
  console.log(`[dev] web  -> http://localhost:${web.port}`);

  if (api.port !== CANONICAL_API || web.port !== CANONICAL_WEB) {
    warn([
      "",
      `Puertos no canónicos (esperados ${CANONICAL_API} y ${CANONICAL_WEB}).`,
      "El inicio de sesión con Google NO va a funcionar: la consola de Google",
      `solo tiene registrado http://localhost:${CANONICAL_API}/api/v1/auth/google/callback.`,
      "Libera los puertos canónicos, o registra estos en Google Cloud Console.",
      "El resto de la app funciona con normalidad.",
      "",
    ]);
  }

  const env = sharedEnv({ apiPort: api.port, webPort: web.port });

  start({ name: "web", args: ["run", "web:dev"], env, critical: true });
  start({ name: "api", args: ["run", "backend:dev"], env, critical: true });
  start({ name: "images", args: ["run", "images:worker"], env, critical: false });
}

main().catch((error) => {
  console.error(`[dev] ${error.message}`);
  process.exitCode = 1;
  shutdown();
});
