import { Container } from "pixi.js";
import type { GameState, Unit, PlayerColor } from "../types.js";
import { UnitRenderer } from "./UnitRenderer.js";
import { UNIT_MOVE_SPEED } from "../config.js";

interface PoolEntry {
  renderer: UnitRenderer;
  visualX: number;
  visualY: number;
  targetX: number;
  targetY: number;
}

export class UnitPool {
  readonly container = new Container();
  private pool = new Map<string, PoolEntry>();

  syncUnits(state: GameState) {
    const activeIds = new Set<string>();

    for (const player of Object.values(state.players)) {
      // Commander
      this.syncUnit(player.commander, player.color, activeIds);

      // Subagent units
      for (const unit of Object.values(player.units)) {
        this.syncUnit(unit, player.color, activeIds);
      }
    }

    // Remove units no longer in state
    for (const [id, entry] of this.pool) {
      if (!activeIds.has(id)) {
        this.container.removeChild(entry.renderer.container);
        entry.renderer.destroy();
        this.pool.delete(id);
      }
    }
  }

  private syncUnit(unit: Unit, playerColor: PlayerColor, activeIds: Set<string>) {
    activeIds.add(unit.id);

    let entry = this.pool.get(unit.id);
    if (!entry) {
      // New unit — create renderer
      const renderer = new UnitRenderer(unit, playerColor);
      entry = {
        renderer,
        visualX: unit.position.x,
        visualY: unit.position.y,
        targetX: unit.position.x,
        targetY: unit.position.y,
      };
      this.pool.set(unit.id, entry);
      this.container.addChild(renderer.container);
    }

    // Update target position
    const target = unit.targetPosition ?? unit.position;
    entry.targetX = target.x;
    entry.targetY = target.y;

    // Update status and name
    entry.renderer.updateStatus(unit.status);
    entry.renderer.updateName(unit.displayName);
  }

  update(dt: number) {
    for (const entry of this.pool.values()) {
      const dx = entry.targetX - entry.visualX;
      const dy = entry.targetY - entry.visualY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1) {
        // Snap to target
        entry.visualX = entry.targetX;
        entry.visualY = entry.targetY;
      } else {
        // Lerp toward target
        const step = Math.min(UNIT_MOVE_SPEED * dt, dist);
        entry.visualX += (dx / dist) * step;
        entry.visualY += (dy / dist) * step;
      }

      entry.renderer.container.x = entry.visualX;
      entry.renderer.container.y = entry.visualY;
    }
  }
}
