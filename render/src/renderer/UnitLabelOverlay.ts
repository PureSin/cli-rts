/**
 * HTML overlay for unit name + action labels.
 * Positioned in world coordinates via the same camera transform as MapOverlay.
 */
export class UnitLabelOverlay {
  readonly el: HTMLDivElement;
  private labels = new Map<string, HTMLDivElement>();
  private hoverable = new Set<string>();

  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText = "transform-origin:0 0;will-change:transform;";
  }

  syncCamera(worldX: number, worldY: number, zoom: number) {
    this.el.style.transform = `translate(${worldX}px,${worldY}px) scale(${zoom})`;
  }

  /** Update or create a label for a unit at the given world position */
  setLabel(unitId: string, x: number, y: number, name: string, actionText: string | null) {
    let el = this.labels.get(unitId);
    if (!el) {
      el = document.createElement("div");
      el.style.cssText =
        "position:absolute;font-family:'Courier New',monospace;white-space:nowrap;text-align:center;transform:translateX(-50%);";
      this.el.appendChild(el);
      this.labels.set(unitId, el);
    }

    el.style.left = `${x}px`;
    el.style.top = `${y + 16}px`;

    let html = `<div style="font-size:8px;color:#aaa">${name}</div>`;
    if (actionText) {
      html += `<div style="font-size:7px;color:#888">${actionText}</div>`;
    }
    el.innerHTML = html;
  }

  /**
   * Make a label respond to mouse hover. Idempotent — safe to call every frame.
   * Must be called after setLabel so the element exists.
   */
  setHoverable(
    unitId: string,
    onEnter: (screenX: number, screenY: number) => void,
    onLeave: () => void,
  ) {
    if (this.hoverable.has(unitId)) return;
    const el = this.labels.get(unitId);
    if (!el) return;
    this.hoverable.add(unitId);
    el.style.pointerEvents = "auto";
    el.style.cursor = "default";
    el.addEventListener("mouseenter", (e) => onEnter(e.clientX, e.clientY));
    el.addEventListener("mouseleave", onLeave);
  }

  /** Remove label for a unit that no longer exists */
  remove(unitId: string) {
    const el = this.labels.get(unitId);
    if (el) {
      el.remove();
      this.labels.delete(unitId);
      this.hoverable.delete(unitId);
    }
  }

  /** Remove labels not in the given set of active IDs */
  prune(activeIds: Set<string>) {
    for (const [id, el] of this.labels) {
      if (!activeIds.has(id)) {
        el.remove();
        this.labels.delete(id);
        this.hoverable.delete(id);
      }
    }
  }
}
