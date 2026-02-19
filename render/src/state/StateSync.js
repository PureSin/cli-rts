import { DAEMON_URL, POLL_INTERVAL_MS } from "../config.js";
export class StateSync {
    currentState = null;
    lastTick = -1;
    listeners = [];
    timer = null;
    fixtureMode = false;
    connected = false;
    onChange(fn) {
        this.listeners.push(fn);
    }
    start() {
        this.fixtureMode = !!window.__FIXTURE_MODE__;
        if (this.fixtureMode) {
            this.loadFixture();
        }
        else {
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
    getState() {
        return this.currentState;
    }
    isFixture() {
        return this.fixtureMode;
    }
    async loadFixture() {
        try {
            const res = await fetch("/__fixture/state.json");
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const state = await res.json();
            this.connected = true;
            this.currentState = state;
            this.lastTick = state.tick;
            for (const fn of this.listeners) {
                fn(state, null);
            }
        }
        catch (err) {
            console.error("Failed to load fixture:", err);
            this.connected = false;
        }
    }
    async poll() {
        try {
            const res = await fetch(`${DAEMON_URL}/state`, { signal: AbortSignal.timeout(3000) });
            if (!res.ok)
                return;
            const state = await res.json();
            this.connected = true;
            if (state.tick !== this.lastTick) {
                const prev = this.currentState;
                this.currentState = state;
                this.lastTick = state.tick;
                for (const fn of this.listeners) {
                    fn(state, prev);
                }
            }
        }
        catch {
            this.connected = false;
        }
    }
}
