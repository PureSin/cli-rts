import { DAEMON_URL } from "../config.js";
import type { GameState } from "../types.js";
import type { EventEntry } from "../state/ReplaySync.js";

export type ScrubHandler = (state: GameState, idx: number, total: number, ts: number) => void;
export type LiveHandler = (state: GameState | null) => void;

type Mode = "live" | "paused" | "playing";

/**
 * Vertical timeline scrubber that sits to the left of the EventLog panel.
 *
 * Modes:
 *   live    — slider at end, renderers driven by StateSync
 *   paused  — frozen at a specific event index
 *   playing — auto-advancing through the event log using timestamp deltas,
 *             switches to live when it reaches the end
 *
 * Controls:
 *   ⏸/▶ button — toggle between paused and playing
 *   ⏭  button  — return to live immediately
 *   Space key  — same as ⏸/▶ button
 */
export class TimelineControls {
  readonly el: HTMLDivElement;
  private playBtn: HTMLButtonElement;
  private liveBtn: HTMLButtonElement;
  private slider: HTMLInputElement;
  private countEl: HTMLSpanElement;

  private events: EventEntry[] = [];
  private cursor = 0;
  private mode: Mode = "live";

  // Playback state
  private rafId: number | null = null;
  private playbackWallStart = 0;   // performance.now() when playback began
  private playbackEventStart = 0;  // events[cursor].ts when playback began

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onScrubCb: ScrubHandler | null = null;
  private onLiveCb: LiveHandler | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "width:44px",
      "background:rgba(5,5,12,0.88)",
      "border:1px solid #222",
      "border-right:none",
      "border-radius:4px 0 0 4px",
      "padding:6px 0",
      "gap:6px",
      "flex-shrink:0",
    ].join(";");

    // Button row
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;flex-direction:row;gap:2px;flex-shrink:0;";

    this.playBtn = this.makeBtn("⏸", "#4af", "Play / Pause  [Space]");
    this.playBtn.addEventListener("click", () => this.togglePlayPause());

    this.liveBtn = this.makeBtn("⏭", "#4af", "Jump to live");
    this.liveBtn.addEventListener("click", () => this.switchToLive());

    btnRow.appendChild(this.playBtn);
    btnRow.appendChild(this.liveBtn);

    // Vertical range slider — bottom = latest, top = oldest
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
      if (this.mode !== "paused") this.pause();
      this.cursor = parseInt(this.slider.value);
      this.emitScrub(this.cursor);
    });

    // Event count label (rotated)
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

    this.el.appendChild(btnRow);
    this.el.appendChild(this.slider);
    this.el.appendChild(this.countEl);
  }

  get isLive(): boolean { return this.mode === "live"; }

  onScrub(cb: ScrubHandler) { this.onScrubCb = cb; }
  onLive(cb: LiveHandler) { this.onLiveCb = cb; }

  start() {
    this.fetchEvents();
    this.pollTimer = setInterval(() => {
      if (this.mode === "live") this.fetchEvents();
    }, 2000);

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        this.togglePlayPause();
      }
    };
    document.addEventListener("keydown", this.keyHandler);
  }

  stop() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this.keyHandler) { document.removeEventListener("keydown", this.keyHandler); }
  }

  /** Called by main each time a live state update arrives. */
  notifyLiveUpdate(total: number) {
    if (this.mode !== "live") return;
    const max = Math.max(0, total - 1);
    this.slider.max = String(max);
    this.slider.value = String(max);
    this.countEl.textContent = String(total);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private makeBtn(label: string, color: string, title: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.style.cssText = [
      "background:none",
      "border:none",
      `color:${color}`,
      "cursor:pointer",
      "font-size:12px",
      "line-height:1",
      "padding:1px 2px",
      "flex-shrink:0",
    ].join(";");
    btn.textContent = label;
    btn.title = title;
    return btn;
  }

  private togglePlayPause() {
    if (this.mode === "live") {
      // First press while live → pause at current end
      this.pause();
    } else if (this.mode === "playing") {
      this.pause();
    } else {
      // paused → start playing forward
      this.startPlayback();
    }
  }

  private pause() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.mode = "paused";
    this.playBtn.textContent = "▶";
    this.playBtn.style.color = "#888";
    this.liveBtn.style.color = "#4af";
  }

  private startPlayback() {
    if (this.events.length === 0) return;
    // If already at the end, restart from beginning of recorded events
    if (this.cursor >= this.events.length - 1) this.cursor = 0;

    this.mode = "playing";
    this.playBtn.textContent = "⏸";
    this.playBtn.style.color = "#4af";

    this.playbackWallStart = performance.now();
    this.playbackEventStart = this.events[this.cursor].ts;

    const tick = () => {
      if (this.mode !== "playing") return;

      const elapsed = performance.now() - this.playbackWallStart;
      const targetTs = this.playbackEventStart + elapsed;

      // Advance cursor to the latest event whose ts <= targetTs
      while (
        this.cursor + 1 < this.events.length &&
        this.events[this.cursor + 1].ts <= targetTs
      ) {
        this.cursor++;
      }

      this.slider.value = String(this.cursor);
      this.emitScrub(this.cursor);

      if (this.cursor >= this.events.length - 1) {
        // Reached the end → switch to live
        this.switchToLive();
        return;
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private switchToLive() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.mode = "live";
    this.playBtn.textContent = "⏸";
    this.playBtn.style.color = "#4af";
    this.liveBtn.style.color = "#555";
    this.slider.value = this.slider.max;
    this.onLiveCb?.(null);
    // Refresh event list immediately
    this.fetchEvents();
  }

  private emitScrub(idx: number) {
    const entry = this.events[idx];
    if (!entry) return;
    this.onScrubCb?.(entry.state, idx, this.events.length, entry.ts);
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

      if (this.mode === "live") this.slider.value = String(max);
    } catch { /* daemon down */ }
  }
}
