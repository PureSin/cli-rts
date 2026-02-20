import { Container } from "pixi.js";
import { createUnitGraphics, createStatusIndicator, playSound } from "../assets/AssetLoader.js";
export class UnitRenderer {
    container = new Container();
    shape;
    statusIndicator = null;
    lastStatus = null;
    lastActionType;
    constructor(unit, playerColor) {
        this.shape = createUnitGraphics(unit.type, playerColor);
        this.container.addChild(this.shape);
        // Name and action labels are rendered by UnitLabelOverlay (HTML) for crisp text
    }
    updateStatus(status, actionType) {
        if (status === this.lastStatus && actionType === this.lastActionType)
            return;
        // Play sounds on status change
        if (status !== this.lastStatus) {
            if (status === "spawning")
                playSound("ready");
            if (status === "failed")
                playSound("pissed");
            if (status === "acting") {
                if (actionType === "attacking")
                    playSound("warcry");
                else
                    playSound("work");
            }
        }
        this.lastStatus = status;
        this.lastActionType = actionType;
        // Remove old indicator
        if (this.statusIndicator) {
            this.container.removeChild(this.statusIndicator);
            this.statusIndicator = null;
        }
        // Add new indicator for acting/waiting/failed
        const indicator = createStatusIndicator(status, actionType);
        if (indicator) {
            this.statusIndicator = indicator;
            this.container.addChild(indicator);
        }
        // Visual feedback for status
        this.shape.alpha = status === "despawning" ? 0.3 : status === "spawning" ? 0.5 : 1;
    }
    destroy() {
        this.container.destroy({ children: true });
    }
}
