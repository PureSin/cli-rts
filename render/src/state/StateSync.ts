import type { GameState } from "../types.js";
import { DAEMON_URL, POLL_INTERVAL_MS } from "../config.js";

declare global {
  interface Window {
    __FIXTURE_MODE__?: boolean;
  }
}

export type StateListener = (state: GameState, prev: GameState | null) => void;

export class StateSync {
  private currentState: GameState | null = null;
  private lastTick = -1;
  private listeners: StateListener[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private fixtureMode = false;
  connected = false;

  onChange(fn: StateListener) {
    this.listeners.push(fn);
  }

  start() {
    this.fixtureMode = !!window.__FIXTURE_MODE__;

    if (this.fixtureMode) {
      this.loadFixture();
    } else {
      this.poll();
      this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getState(): GameState | null {
    return this.currentState;
  }

  isFixture(): boolean {
    return this.fixtureMode;
  }

  private async loadFixture() {
    try {
      const res = await fetch("/__fixture/state.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const state: GameState = await res.json();
      this.connected = true;
      this.currentState = state;
      this.lastTick = state.tick;
      for (const fn of this.listeners) {
        fn(state, null);
      }
    } catch (err) {
      console.error("Failed to load fixture:", err);
      this.connected = false;
    }
  }

  private async poll() {
    try {
      const res = await fetch(`${DAEMON_URL}/state`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return;
      const state: GameState = await res.json();

      this.connected = true;

      if (state.tick !== this.lastTick) {
        const prev = this.currentState;
        this.currentState = state;
        this.lastTick = state.tick;
        for (const fn of this.listeners) {
          fn(state, prev);
        }
      }
    } catch {
      this.connected = false;
    }
  }
}
