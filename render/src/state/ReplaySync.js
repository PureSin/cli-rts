export class ReplaySync {
    entries;
    cursor = 0;
    listeners = [];
    replayListeners = [];
    playing = false;
    speed = 1;
    playTimer = null;
    connected = true;
    constructor(entries) {
        this.entries = entries;
    }
    onChange(fn) {
        this.listeners.push(fn);
    }
    onSeek(fn) {
        this.replayListeners.push(fn);
    }
    getState() {
        return this.entries.length > 0 ? this.entries[this.cursor].state : null;
    }
    getEntry() {
        return this.entries.length > 0 ? this.entries[this.cursor] : null;
    }
    getCursor() {
        return this.cursor;
    }
    getLength() {
        return this.entries.length;
    }
    isFixture() {
        return false;
    }
    isReplay() {
        return true;
    }
    isPlaying() {
        return this.playing;
    }
    getSpeed() {
        return this.speed;
    }
    seek(index) {
        if (index < 0 || index >= this.entries.length)
            return;
        const prev = this.entries[this.cursor]?.state ?? null;
        this.cursor = index;
        const entry = this.entries[this.cursor];
        for (const fn of this.listeners)
            fn(entry.state, prev);
        for (const fn of this.replayListeners)
            fn(this.cursor, entry);
    }
    play() {
        if (this.playing)
            return;
        this.playing = true;
        this.scheduleNext();
    }
    pause() {
        this.playing = false;
        if (this.playTimer) {
            clearTimeout(this.playTimer);
            this.playTimer = null;
        }
    }
    setSpeed(multiplier) {
        this.speed = multiplier;
        // If playing, reschedule with new speed
        if (this.playing) {
            if (this.playTimer)
                clearTimeout(this.playTimer);
            this.scheduleNext();
        }
    }
    /** Emit initial state to all listeners */
    start() {
        if (this.entries.length > 0) {
            this.seek(0);
        }
    }
    scheduleNext() {
        if (!this.playing)
            return;
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
