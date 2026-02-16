import { defineConfig, type Plugin } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function fixturePlugin(): Plugin {
  // First positional arg after `--` is the fixture path
  const args = process.argv;
  const dashDash = args.indexOf("--");
  const fixturePath = dashDash >= 0 ? args[dashDash + 1] : process.env.FIXTURE;

  if (!fixturePath) return { name: "fixture-noop" };

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
    // Inject fixture flag so the client knows to use fixture mode
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          children: `window.__FIXTURE_MODE__ = true;`,
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  root: ".",
  server: { port: 5175 },
  build: { outDir: "dist" },
  plugins: [fixturePlugin()],
});
