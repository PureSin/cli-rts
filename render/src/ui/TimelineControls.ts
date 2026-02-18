import { DAEMON_URL } from "../config.js";
import type { GameState } from "../types.js";
import type { EventEntry } from "../state/ReplaySync.js";

export type ScrubHandler = (state: GameState, idx: number, total: number) => void;
export type LiveHandler = (state: GameState | null) => void;

/**
 * Vertical timeline scrubber that sits to the left of the EventLog panel.
 * In live mode it polls GET /events from the daemon and advances the slider
 * to the latest event automatically. When the user grabs the slider or hits
 * pause, it switches to scrub mode and emits historical states.
 */
export class TimelineControls {
  readonly el: HTMLDivElement;
  private btn: HTMLButtonElement;
  private slider: HTMLInputElement;
  private countEl: HTMLSpanElement;

  private events: EventEntry[] = [];
  private _isLive = true;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onScrubCb: ScrubHandler | null = null;
  private onLiveCb: LiveHandler | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "width:28px",
      "background:rgba(5,5,12,0.88)",
      "border:1px solid #222",
      "border-right:none",
      "border-radius:4px 0 0 4px",
      "padding:6px 0",
      "gap:6px",
      "flex-shrink:0",
    ].join(";");

    // Play / pause button
    this.btn = document.createElement("button");
    this.btn.style.cssText = [
      "background:none",
      "border:none",
      "color:#4af",
      "cursor:pointer",
      "font-size:13px",
      "line-height:1",
      "padding:0",
      "flex-shrink:0",
      "width:20px",
      "text-align:center",
    ].join(";");
    this.btn.textContent = "⏸";
    this.btn.title = "Pause (scrub history) / Resume (live)";
    this.btn.addEventListener("click", () => this.togglePlayPause());

    // Vertical range slider — min = 0 (oldest), max = N (newest/live)
    this.slider = document.createElement("input");
    this.slider.type = "range";
    this.slider.min = "0";
    this.slider.max = "0";
    this.slider.value = "0";
    this.slider.style.cssText = [
      "writing-mode:vertical-lr",
      "flex:1",
      "width:18px",
      "min-height:0",
      "cursor:pointer",
      "accent-color:#4af",
    ].join(";");
    this.slider.addEventListener("input", () => {
      if (this._isLive) this.pauseInternal();
      this.emitScrub(parseInt(this.slider.value));
    });

    // Event count label at the bottom
    this.countEl = document.createElement("span");
    this.countEl.style.cssText = [
      "color:#333",
      "font-family:monospace",
      "font-size:9px",
      "writing-mode:vertical-lr",
      "letter-spacing:1px",
      "flex-shrink:0",
      "user-select:none",
    ].join(";");
    this.countEl.textContent = "0";

    this.el.appendChild(this.btn);
    this.el.appendChild(this.slider);
    this.el.appendChild(this.countEl);
  }

  get isLive(): boolean {
    return this._isLive;
  }

  onScrub(cb: ScrubHandler) {
    this.onScrubCb = cb;
  }

  onLive(cb: LiveHandler) {
    this.onLiveCb = cb;
  }

  start() {
    this.fetchEvents();
    this.pollTimer = setInterval(() => {
      if (this._isLive) this.fetchEvents();
    }, 2000);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Push slider to end and mark as live (called by main when state updates arrive). */
  notifyLiveUpdate(total: number) {
    if (!this._isLive) return;
    const max = Math.max(0, total - 1);
    this.slider.max = String(max);
    this.slider.value = String(max);
    this.countEl.textContent = String(total);
  }

  private pauseInternal() {
    this._isLive = false;
    this.btn.textContent = "▶";
    this.btn.style.color = "#888";
  }

  private togglePlayPause() {
    if (this._isLive) {
      this.pauseInternal();
    } else {
      // Return to live
      this._isLive = true;
      this.btn.textContent = "⏸";
      this.btn.style.color = "#4af";
      // Jump to end
      this.slider.value = this.slider.max;
      this.onLiveCb?.(null);
    }
  }

  private emitScrub(idx: number) {
    const entry = this.events[idx];
    if (entry) {
      this.onScrubCb?.(entry.state, idx, this.events.length);
    }
  }

  private async fetchEvents() {
    try {
      const res = await fetch(`${DAEMON_URL}/events`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return;
      const text = await res.text();
      const lines = text.trim().split("\n").filter((l) => l.length > 0);
      if (lines.length === this.events.length) return;

      this.events = lines.map((l) => JSON.parse(l) as EventEntry);
      const max = Math.max(0, this.events.length - 1);
      this.slider.max = String(max);
      this.countEl.textContent = String(this.events.length);

      if (this._isLive) {
        this.slider.value = String(max);
      }
    } catch {
      /* daemon down — silently skip */
    }
  }
}
