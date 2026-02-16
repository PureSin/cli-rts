import { Container } from "pixi.js";

export class Camera {
  readonly world: Container;
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private worldStart = { x: 0, y: 0 };

  private _zoom = 1;
  private readonly MIN_ZOOM = 0.25;
  private readonly MAX_ZOOM = 3;

  constructor(private canvas: HTMLCanvasElement) {
    this.world = new Container();
    this.setupEvents();
  }

  get zoom() {
    return this._zoom;
  }

  get worldX() {
    return this.world.x;
  }

  get worldY() {
    return this.world.y;
  }

  centerOn(x: number, y: number) {
    this.world.x = this.canvas.width / 2 - x * this._zoom;
    this.world.y = this.canvas.height / 2 - y * this._zoom;
  }

  private setupEvents() {
    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.worldStart = { x: this.world.x, y: this.world.y };
      this.canvas.style.cursor = "grabbing";
    });

    window.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.world.x = this.worldStart.x + (e.clientX - this.dragStart.x);
      this.world.y = this.worldStart.y + (e.clientY - this.dragStart.y);
    });

    window.addEventListener("pointerup", () => {
      this.dragging = false;
      this.canvas.style.cursor = "default";
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this._zoom * factor));

      // Zoom toward cursor position
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - this.world.x) / this._zoom;
      const worldY = (mouseY - this.world.y) / this._zoom;

      this._zoom = newZoom;
      this.world.scale.set(this._zoom);

      this.world.x = mouseX - worldX * this._zoom;
      this.world.y = mouseY - worldY * this._zoom;
    }, { passive: false });
  }
}
