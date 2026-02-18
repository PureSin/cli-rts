import { defineConfig, type Plugin } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Resolve the first positional arg after `--` or an env var */
function resolveArgPath(envVar: string): string | undefined {
  const args = process.argv;
  const dashDash = args.indexOf("--");
  return dashDash >= 0 ? args[dashDash + 1] : process.env[envVar];
}

function fixturePlugin(): Plugin {
  const fixturePath = resolveArgPath("FIXTURE");
  if (!fixturePath || !fixturePath.endsWith(".json")) return { name: "fixture-noop" };

  const absPath = resolve(fixturePath);
  if (!existsSync(absPath)) {
    console.error(`Fixture not found: ${absPath}`);
    process.exit(1);
  }

  console.log(`\n  Fixture mode: serving ${absPath}\n`);

  return {
    name: "fixture-state",
    configureServer(server) {
      server.middlewares.use("/__fixture/state.json", (_req, res) => {
        try {
          const data = readFileSync(absPath, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(data);
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: `window.__FIXTURE_MODE__ = true;`,
          injectTo: "head-prepend" as const,
        },
      ];
    },
  };
}

function replayPlugin(): Plugin {
  const replayPath = resolveArgPath("REPLAY");
  if (!replayPath || !replayPath.endsWith(".jsonl")) return { name: "replay-noop" };

  const absPath = resolve(replayPath);
  if (!existsSync(absPath)) {
    console.error(`Replay log not found: ${absPath}`);
    process.exit(1);
  }

  console.log(`\n  Replay mode: serving ${absPath}\n`);

  return {
    name: "replay-events",
    configureServer(server) {
      server.middlewares.use("/__replay/events.jsonl", (_req, res) => {
        try {
          const data = readFileSync(absPath, "utf-8");
          res.setHeader("Content-Type", "application/x-ndjson");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(data);
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: `window.__REPLAY_MODE__ = true;`,
          injectTo: "head-prepend" as const,
        },
      ];
    },
  };
}

export default defineConfig({
  root: ".",
  server: { port: 5175 },
  build: { outDir: "dist" },
  plugins: [fixturePlugin(), replayPlugin()],
});
