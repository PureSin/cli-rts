import type { GameState } from "../types.js";
import type { StateListener } from "./StateSync.js";

export interface EventEntry {
  seq: number;
  ts: number;
  eventType: string;
  payload: unknown;
  state: GameState;
}

export type ReplayListener = (cursor: number, entry: EventEntry) => void;

export class ReplaySync {
  private entries: EventEntry[];
  private cursor = 0;
  private listeners: StateListener[] = [];
  private replayListeners: ReplayListener[] = [];
  private playing = false;
  private speed = 1;
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  connected = true;

  constructor(entries: EventEntry[]) {
    this.entries = entries;
  }

  onChange(fn: StateListener): void {
    this.listeners.push(fn);
  }

  onSeek(fn: ReplayListener): void {
    this.replayListeners.push(fn);
  }

  getState(): GameState | null {
    return this.entries.length > 0 ? this.entries[this.cursor].state : null;
  }

  getEntry(): EventEntry | null {
    return this.entries.length > 0 ? this.entries[this.cursor] : null;
  }

  getCursor(): number {
    return this.cursor;
  }

  getLength(): number {
    return this.entries.length;
  }

  isFixture(): boolean {
    return false;
  }

  isReplay(): boolean {
    return true;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getSpeed(): number {
    return this.speed;
  }

  seek(index: number): void {
    if (index < 0 || index >= this.entries.length) return;
    const prev = this.entries[this.cursor]?.state ?? null;
    this.cursor = index;
    const entry = this.entries[this.cursor];
    for (const fn of this.listeners) fn(entry.state, prev);
    for (const fn of this.replayListeners) fn(this.cursor, entry);
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.scheduleNext();
  }

  pause(): void {
    this.playing = false;
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
  }

  setSpeed(multiplier: number): void {
    this.speed = multiplier;
    // If playing, reschedule with new speed
    if (this.playing) {
      if (this.playTimer) clearTimeout(this.playTimer);
      this.scheduleNext();
    }
  }

  /** Emit initial state to all listeners */
  start(): void {
    if (this.entries.length > 0) {
      this.seek(0);
    }
  }

  private scheduleNext(): void {
    if (!this.playing) return;
    if (this.cursor >= this.entries.length - 1) {
      this.playing = false;
      return;
    }

    const current = this.entries[this.cursor];
    const next = this.entries[this.cursor + 1];
    const delta = Math.max(next.ts - current.ts, 16); // min 16ms
    const delay = delta / this.speed;

    this.playTimer = setTimeout(() => {
      this.seek(this.cursor + 1);
      this.scheduleNext();
    }, delay);
  }
}
