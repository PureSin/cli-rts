export class GameLoop {
  private updateFn: (dt: number) => void;
  private lastTime = 0;
  private running = false;

  constructor(updateFn: (dt: number) => void) {
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

  private tick = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // cap at 100ms to avoid jumps
    this.lastTime = now;
    this.updateFn(dt);
    requestAnimationFrame(this.tick);
  };
}
