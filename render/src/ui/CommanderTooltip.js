function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)
        return `${s}s ago`;
    if (s < 3600)
        return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}
export class CommanderTooltip {
    el;
    constructor() {
        this.el = document.createElement("div");
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
    show(player, screenX, screenY) {
        const { stats, commander } = player;
        const failStr = stats.toolCallsFailed > 0 ? ` (${stats.toolCallsFailed} ✗)` : "";
        const rows = [
            ["session", player.sessionId.slice(0, 8) + "…"],
            ["model", player.model],
            ["mode", player.permissionMode],
            ["status", player.status],
            ["tools", `${stats.toolCallsTotal}${failStr}`],
            ["read", String(stats.filesRead)],
            ["written", String(stats.filesWritten)],
            ["bash", String(stats.bashCommandsRun)],
            ["subagents", String(stats.subagentsSpawned)],
            ["last seen", timeAgo(player.lastActivityAt)],
        ];
        if (commander.currentAction) {
            const a = commander.currentAction;
            const target = a.target.split("/").pop() ?? a.target;
            rows.push(["doing", `${a.toolName}: ${target}`]);
        }
        this.el.innerHTML = rows.map(([k, v]) => `<div><span style="color:#445;display:inline-block;width:64px">${k}</span>` +
            `<span style="color:#aaa">${v}</span></div>`).join("");
        // Position near cursor, keep within viewport
        const pad = 12;
        let x = screenX + pad;
        let y = screenY + pad;
        if (x + 210 > window.innerWidth)
            x = screenX - 210 - pad;
        if (y + 260 > window.innerHeight)
            y = screenY - 260 - pad;
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.display = "block";
    }
    hide() {
        this.el.style.display = "none";
    }
}
