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

    const statsHtml = rows.map(([k, v]) =>
      `<div><span style="color:#445;display:inline-block;width:64px">${k}</span>` +
      `<span style="color:#aaa">${v}</span></div>`
    ).join("");

    const workingHtml =
      `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #334">` +
      `<div style="color:#556;margin-bottom:2px;font-size:10px;letter-spacing:1px">WORKING ON</div>` +
      `<div style="color:#e8c46a;white-space:normal;word-break:break-word;max-width:190px;line-height:1.5">${workingOn}</div>` +
      `</div>`;

    this.el.innerHTML = statsHtml + workingHtml;

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
