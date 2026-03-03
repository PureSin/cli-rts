import type { Player, UnitAction } from "../types.js";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export class CommanderTooltip {
  readonly el: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.dataset.testid = "commander-tooltip";
    this.el.style.cssText = [
      "position:fixed",
      "z-index:20",
      "font-family:monospace",
      "font-size:11px",
      "background:rgba(5,5,15,0.96)",
      "border:1px solid #334",
      "border-radius:4px",
      "padding:8px 10px",
      "pointer-events:none",
      "display:none",
      "min-width:190px",
      "line-height:1.8",
    ].join(";");
  }

  show(player: Player, screenX: number, screenY: number, lastAction?: UnitAction | null) {
    const { stats, commander } = player;
    const failStr = stats.toolCallsFailed > 0 ? ` (${stats.toolCallsFailed} ✗)` : "";

    const rows: [string, string][] = [
      ["session",   player.sessionId.slice(0, 8) + "…"],
      ["model",     player.model],
      ["mode",      player.permissionMode],
      ["status",    player.status],
      ["tools",     `${stats.toolCallsTotal}${failStr}`],
      ["read",      String(stats.filesRead)],
      ["written",   String(stats.filesWritten)],
      ["bash",      String(stats.bashCommandsRun)],
      ["subagents", String(stats.subagentsSpawned)],
      ["last seen", timeAgo(player.lastActivityAt)],
    ];

    // Show current action, or fall back to the last known action
    const action = commander.currentAction ?? lastAction ?? null;
    let workingOn = "—";
    if (action) {
      workingOn = action.description || `${action.toolName}: ${action.target.split("/").pop() ?? action.target}`;
    }

    this.el.replaceChildren();

    for (const [k, v] of rows) {
      const row = document.createElement("div");
      const keyEl = document.createElement("span");
      keyEl.style.color = "#445";
      keyEl.style.display = "inline-block";
      keyEl.style.width = "64px";
      keyEl.textContent = k;
      const valEl = document.createElement("span");
      valEl.style.color = "#aaa";
      valEl.textContent = v;
      row.appendChild(keyEl);
      row.appendChild(valEl);
      this.el.appendChild(row);
    }

    const workingContainer = document.createElement("div");
    workingContainer.style.marginTop = "5px";
    workingContainer.style.paddingTop = "5px";
    workingContainer.style.borderTop = "1px solid #334";

    const header = document.createElement("div");
    header.style.color = "#556";
    header.style.marginBottom = "2px";
    header.style.fontSize = "10px";
    header.style.letterSpacing = "1px";
    header.textContent = "WORKING ON";

    const content = document.createElement("div");
    content.style.color = "#e8c46a";
    content.style.whiteSpace = "normal";
    content.style.wordBreak = "break-word";
    content.style.maxWidth = "190px";
    content.style.lineHeight = "1.5";
    content.textContent = workingOn;

    workingContainer.appendChild(header);
    workingContainer.appendChild(content);
    this.el.appendChild(workingContainer);

    // Position near cursor, keep within viewport
    const pad = 12;
    let x = screenX + pad;
    let y = screenY + pad;
    if (x + 220 > window.innerWidth)  x = screenX - 220 - pad;
    if (y + 300 > window.innerHeight) y = screenY - 300 - pad;

    this.el.style.left = `${x}px`;
    this.el.style.top  = `${y}px`;
    this.el.style.display = "block";
  }

  hide() {
    this.el.style.display = "none";
  }
}
