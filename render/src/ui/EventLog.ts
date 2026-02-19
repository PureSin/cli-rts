import type { GameState, GameEvent, GameEventType, PlayerColor } from "../types.js";

const PLAYER_COLOR_CSS: Record<PlayerColor, string> = {
  blue: "#4488ff",
  red: "#ff4444",
  green: "#44cc44",
  yellow: "#cccc44",
  purple: "#aa44ff",
  orange: "#ff8844",
};

const TYPE_COLOR: Partial<Record<GameEventType, string>> = {
  player_joined: "#4af",
  player_left: "#f84",
  unit_spawned: "#4f4",
  unit_despawned: "#f64",
  unit_action_start: "#cc4",
  unit_action_complete: "#4c8",
  unit_action_failed: "#f44",
  unit_waiting: "#fa4",
  objective_completed: "#4af",
  player_idle: "#445",
  player_compact: "#a4f",
};

const MIN_WIDTH = 160;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 300;

export class EventLog {
  readonly el: HTMLDivElement;
  private header: HTMLDivElement;
  private headerTime: HTMLSpanElement;
  private headerStatus: HTMLSpanElement;
  private list: HTMLDivElement;
  private lastEventId = "";

  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText = [
      `width:${DEFAULT_WIDTH}px`,
      "display:flex",
      "flex-direction:column",
      "font-family:monospace",
      "font-size:11px",
      "border-radius:0 4px 4px 0",
      "overflow:hidden",
      "border:1px solid #222",
    ].join(";");

    // Drag handle — left edge of the panel
    const handle = document.createElement("div");
    handle.style.cssText = [
      "position:absolute",
      "top:0",
      "left:0",
      "width:6px",
      "height:100%",
      "cursor:ew-resize",
      "z-index:1",
    ].join(";");
    handle.addEventListener("mousedown", (e) => this.startResize(e));
    this.el.appendChild(handle);

    this.header = document.createElement("div");
    this.header.style.cssText = [
      "padding:5px 10px",
      "background:rgba(10,10,20,0.92)",
      "color:#445",
      "font-size:10px",
      "letter-spacing:1px",
      "text-transform:uppercase",
      "border-bottom:1px solid #222",
      "flex-shrink:0",
      "display:flex",
      "justify-content:space-between",
      "align-items:center",
    ].join(";");
    const headerLabel = document.createElement("span");
    headerLabel.style.cssText = "letter-spacing:1px;color:#445";
    headerLabel.textContent = "EVENT LOG";

    this.headerTime = document.createElement("span");
    this.headerTime.style.cssText = "color:#4af;font-size:10px;";
    this.headerTime.textContent = "";

    this.headerStatus = document.createElement("span");
    this.headerStatus.style.cssText = "font-size:10px;";
    this.headerStatus.textContent = "";

    this.header.appendChild(headerLabel);
    this.header.appendChild(this.headerTime);
    this.header.appendChild(this.headerStatus);

    this.list = document.createElement("div");
    this.list.style.cssText = [
      "flex:1",
      "overflow-y:auto",
      "background:rgba(5,5,12,0.88)",
      "overscroll-behavior:contain",
      "min-height:0",
    ].join(";");

    this.el.appendChild(this.header);
    this.el.appendChild(this.list);
  }

  /** Called from the game loop to update the connection status chip. */
  setStatus(text: string, color: string) {
    this.headerStatus.textContent = text;
    this.headerStatus.style.color = color;
  }

  /** Show or clear the current event timestamp (e.g. while scrubbing). */
  setTime(text: string) {
    this.headerTime.textContent = text;
  }

  update(state: GameState) {
    const events = state.eventLog;
    if (events.length === 0) return;
    const lastId = events[events.length - 1].id;
    if (lastId === this.lastEventId) return;
    this.lastEventId = lastId;
    this.render(events, state.players);
  }

  private render(events: GameEvent[], players: GameState["players"]) {
    // Track scroll position — if the user has scrolled up, don't force-scroll down
    const atBottom =
      this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 40;

    this.list.innerHTML = "";

    for (const evt of events) {
      if (evt.type === "session_clear") {
        const playerColor = players[evt.playerId]?.color;
        const color = playerColor ? PLAYER_COLOR_CSS[playerColor] : "#445";
        const divider = document.createElement("div");
        divider.style.cssText = [
          "padding:4px 8px",
          "border-top:1px solid #0e0e18",
          "border-bottom:1px solid #0e0e18",
          "text-align:center",
          `color:${color}`,
          "opacity:0.65",
          "font-size:10px",
          "letter-spacing:2px",
        ].join(";");
        divider.textContent = "↺  cleared";
        this.list.appendChild(divider);
        continue;
      }

      const row = document.createElement("div");
      row.style.cssText = [
        "padding:3px 8px",
        "border-bottom:1px solid #0e0e18",
        "line-height:1.6",
        "display:flex",
        "gap:6px",
        "align-items:baseline",
      ].join(";");

      const tick = document.createElement("span");
      tick.style.cssText = "color:#2a2a3a;flex-shrink:0;width:28px;text-align:right";
      tick.textContent = String(evt.tick);

      const dot = document.createElement("span");
      dot.style.cssText = `color:${TYPE_COLOR[evt.type] ?? "#445"};flex-shrink:0`;
      dot.textContent = "·";

      const msg = document.createElement("span");
      msg.style.cssText =
        "color:#8a8aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0";
      msg.textContent = evt.message;
      msg.title = evt.message;

      row.appendChild(tick);
      row.appendChild(dot);
      row.appendChild(msg);
      this.list.appendChild(row);
    }

    if (atBottom) {
      this.list.scrollTop = this.list.scrollHeight;
    }
  }

  private startResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = this.el.offsetWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX; // dragging left → positive delta → wider
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      this.el.style.width = `${newWidth}px`;
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
}
