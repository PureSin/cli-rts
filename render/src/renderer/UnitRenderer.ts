import { Container, Graphics, Text } from "pixi.js";
import type { Unit, PlayerColor, UnitStatus } from "../types.js";
import { createUnitGraphics, createStatusIndicator } from "../assets/AssetLoader.js";

export class UnitRenderer {
  readonly container = new Container();
  private shape: Graphics;
  private nameLabel: Text;
  private statusIndicator: Graphics | null = null;
  private lastStatus: UnitStatus | null = null;

  constructor(unit: Unit, playerColor: PlayerColor) {
    this.shape = createUnitGraphics(unit.type, playerColor);
    this.container.addChild(this.shape);

    this.nameLabel = new Text({
      text: unit.displayName,
      style: {
        fontSize: 8,
        fill: 0xaaaaaa,
        fontFamily: "Courier New",
      },
    });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.y = 16;
    this.container.addChild(this.nameLabel);
  }

  updateStatus(status: UnitStatus) {
    if (status === this.lastStatus) return;
    this.lastStatus = status;

    // Remove old indicator
    if (this.statusIndicator) {
      this.container.removeChild(this.statusIndicator);
      this.statusIndicator = null;
    }

    // Add new indicator for acting/waiting/failed
    const indicator = createStatusIndicator(status);
    if (indicator) {
      this.statusIndicator = indicator;
      this.container.addChild(indicator);
    }

    // Visual feedback for status
    this.shape.alpha = status === "despawning" ? 0.3 : status === "spawning" ? 0.5 : 1;
  }

  updateName(name: string) {
    this.nameLabel.text = name;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
