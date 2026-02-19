import { Container } from "pixi.js";
import type { GameState, Unit, PlayerColor, UnitAction } from "../types.js";
import { UnitRenderer } from "./UnitRenderer.js";
import { UnitLabelOverlay } from "./UnitLabelOverlay.js";
import { UNIT_MOVE_SPEED } from "../config.js";

interface PoolEntry {
  renderer: UnitRenderer;
  visualX: number;
  visualY: number;
  targetX: number;
  targetY: number;
  displayName: string;
  currentAction: UnitAction | null;
  lastClearedAt: number | undefined;
  animClear: { elapsed: number } | null;
}

export class UnitPool {
  readonly container = new Container();
  private pool = new Map<string, PoolEntry>();
  private labelOverlay: UnitLabelOverlay | null = null;

  setLabelOverlay(overlay: UnitLabelOverlay) {
    this.labelOverlay = overlay;
  }

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

    // Prune orphaned labels
    this.labelOverlay?.prune(activeIds);
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
        displayName: unit.displayName,
        currentAction: unit.currentAction,
        lastClearedAt: unit.clearedAt,
        animClear: null,
      };
      this.pool.set(unit.id, entry);
      this.container.addChild(renderer.container);
    }

    // Update target position
    const target = unit.targetPosition ?? unit.position;
    entry.targetX = target.x;
    entry.targetY = target.y;

    // Update status — pass action type so the indicator colour reflects the tool
    entry.renderer.updateStatus(unit.status, unit.currentAction?.actionType ?? undefined);
    entry.displayName = unit.displayName;
    entry.currentAction = unit.currentAction;

    // Detect a new clearedAt timestamp → trigger rebirth animation
    if (unit.clearedAt !== undefined && unit.clearedAt !== entry.lastClearedAt) {
      entry.lastClearedAt = unit.clearedAt;
      entry.animClear = { elapsed: 0 };
    }
  }

  update(dt: number) {
    const CLEAR_FADE_OUT = 300; // ms: alpha 1→0
    const CLEAR_FADE_IN  = 400; // ms: alpha 0→1
    const CLEAR_TOTAL    = CLEAR_FADE_OUT + CLEAR_FADE_IN;

    for (const [id, entry] of this.pool) {
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

      // Drive rebirth pulse animation (fade out then fade in)
      if (entry.animClear) {
        entry.animClear.elapsed += dt * 1000;
        const t = entry.animClear.elapsed;
        if (t < CLEAR_FADE_OUT) {
          entry.renderer.container.alpha = 1 - t / CLEAR_FADE_OUT;
        } else if (t < CLEAR_TOTAL) {
          entry.renderer.container.alpha = (t - CLEAR_FADE_OUT) / CLEAR_FADE_IN;
        } else {
          entry.renderer.container.alpha = 1;
          entry.animClear = null;
        }
      }

      // Update HTML label position
      if (this.labelOverlay) {
        let actionText: string | null = null;
        if (entry.currentAction) {
          const fname = entry.currentAction.target.split("/").pop() ?? entry.currentAction.target;
          actionText = `${entry.currentAction.toolName}: ${fname}`;
        }
        this.labelOverlay.setLabel(id, entry.visualX, entry.visualY, entry.displayName, actionText);
      }
    }
  }
}
