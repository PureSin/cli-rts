import http from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createEmptyState, type GameState } from "../game-state.js";
import { handleEvent } from "../event-handlers.js";

export async function startCommand(port: number): Promise<void> {
  const cwd = process.cwd();
  const stateDir = join(cwd, ".cli-rts");
  const statePath = join(stateDir, "game-state.json");

  // Ensure .cli-rts/ exists
  if (!existsSync(stateDir)) {
    await mkdir(stateDir, { recursive: true });
  }

  const state = createEmptyState(cwd);

  // Write initial state
  await writeStateFile(statePath, state);

  const server = http.createServer(async (req, res) => {
    // CORS headers for future browser UI
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/events") {
      try {
        const body = await readBody(req);
        const { eventType, payload } = JSON.parse(body);
        const event = handleEvent(state, eventType, payload ?? {});
        await writeStateFile(statePath, state);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, tick: state.tick, event: event.id }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
      return;
    }

    if (req.method === "GET" && req.url === "/state") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state, null, 2));
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, tick: state.tick }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`cli-rts daemon listening on http://127.0.0.1:${port}`);
    console.log(`  POST /events  — receive hook events`);
    console.log(`  GET  /state   — current game state`);
    console.log(`  GET  /health  — health check`);
    console.log(`\nGame state: ${statePath}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function writeStateFile(path: string, state: GameState): Promise<void> {
  await writeFile(path, JSON.stringify(state, null, 2) + "\n");
}
