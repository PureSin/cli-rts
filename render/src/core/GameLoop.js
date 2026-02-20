export class GameLoop {
    updateFn;
    lastTime = 0;
    running = false;
    constructor(updateFn) {
        this.updateFn = updateFn;
    }
    start() {
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.tick);
    }
    stop() {
        this.running = false;
    }
    tick = (now) => {
        if (!this.running)
            return;
        const dt = Math.min((now - this.lastTime) / 1000, 0.1); // cap at 100ms to avoid jumps
        this.lastTime = now;
        this.updateFn(dt);
        requestAnimationFrame(this.tick);
    };
}
