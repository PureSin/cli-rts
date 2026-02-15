import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const HOOK_EVENT_TYPES = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "Stop",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "PermissionRequest",
  "Notification",
  "TaskCompleted",
  "PreCompact",
] as const;

const EVENT_SLUG: Record<string, string> = {
  SessionStart: "session-start",
  SessionEnd: "session-end",
  UserPromptSubmit: "user-prompt",
  Stop: "stop",
  PreToolUse: "pre-tool",
  PostToolUse: "post-tool",
  PostToolUseFailure: "post-tool-failure",
  SubagentStart: "subagent-start",
  SubagentStop: "subagent-stop",
  PermissionRequest: "permission-request",
  Notification: "notification",
  TaskCompleted: "task-completed",
  PreCompact: "pre-compact",
};

interface HookEntry {
  type: string;
  command: string;
  async?: boolean;
  __cli_rts?: boolean;
}

interface HookConfig {
  hooks: HookEntry[];
}

interface Settings {
  hooks?: Record<string, HookConfig[]>;
  [key: string]: unknown;
}

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  const claudeDir = join(cwd, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  // Ensure .claude/ exists
  if (!existsSync(claudeDir)) {
    await mkdir(claudeDir, { recursive: true });
    console.log("Created .claude/ directory");
  }

  // Read or create settings.json
  let settings: Settings = {};
  if (existsSync(settingsPath)) {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
    console.log("Read existing .claude/settings.json");
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Merge hook entries
  let added = 0;
  let skipped = 0;

  for (const eventType of HOOK_EVENT_TYPES) {
    const slug = EVENT_SLUG[eventType];
    const ourHook: HookEntry = {
      type: "command",
      command: `cli-rts emit ${slug}`,
      async: true,
      __cli_rts: true,
    };

    if (!settings.hooks[eventType]) {
      settings.hooks[eventType] = [];
    }

    const hookConfigs = settings.hooks[eventType];

    // Check if our hook already exists in any config
    const alreadyInstalled = hookConfigs.some((config) =>
      config.hooks?.some((h) => h.__cli_rts === true)
    );

    if (alreadyInstalled) {
      skipped++;
      continue;
    }

    // Add our hook config
    hookConfigs.push({ hooks: [ourHook] });
    added++;
  }

  // Write settings
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`Updated .claude/settings.json: ${added} hooks added, ${skipped} already present`);

  // Ensure .cli-rts/ is in .gitignore
  const gitignorePath = join(cwd, ".gitignore");
  let gitignore = "";
  if (existsSync(gitignorePath)) {
    gitignore = await readFile(gitignorePath, "utf-8");
  }

  if (!gitignore.includes(".cli-rts/")) {
    const entry = gitignore.endsWith("\n") || gitignore === "" ? ".cli-rts/\n" : "\n.cli-rts/\n";
    await writeFile(gitignorePath, gitignore + entry);
    console.log("Added .cli-rts/ to .gitignore");
  }

  console.log("\nDone! Run `cli-rts start` to start the daemon.");
}
