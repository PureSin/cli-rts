#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { emitCommand } from "./commands/emit.js";
import { startCommand } from "./commands/start.js";

const DEFAULT_PORT = 4175;

const program = new Command();

program
  .name("cli-rts")
  .description("RTS game state from Claude Code hook events")
  .version("0.1.0");

program
  .command("init")
  .description("Install hooks into .claude/settings.json")
  .action(async () => {
    await initCommand();
  });

program
  .command("start")
  .description("Start the game state daemon")
  .option("-p, --port <port>", "Port to listen on", String(DEFAULT_PORT))
  .action(async (opts) => {
    await startCommand(parseInt(opts.port, 10));
  });

program
  .command("emit <event-type>")
  .description("Emit a hook event to the daemon (reads JSON from stdin)")
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
  .action(async (eventType, opts) => {
    await emitCommand(eventType, parseInt(opts.port, 10));
  });

program.parse();
