const SPEEDS = [0.5, 1, 2, 4];
export class ReplayControls {
    el;
    slider;
    playBtn;
    speedBtn;
    label;
    eventLabel;
    sync;
    constructor(sync) {
        this.sync = sync;
        this.el = document.createElement("div");
        this.el.style.cssText = [
            "position:fixed",
            "bottom:0",
            "left:0",
            "width:100%",
            "background:rgba(10,10,15,0.92)",
            "border-top:1px solid rgba(255,255,255,0.15)",
            "padding:8px 16px",
            "display:flex",
            "align-items:center",
            "gap:10px",
            "z-index:100",
            "font-family:monospace",
            "font-size:12px",
            "color:#ccc",
            "pointer-events:auto",
        ].join(";");
        // Play/pause
        this.playBtn = document.createElement("button");
        this.styleButton(this.playBtn);
        this.playBtn.textContent = "\u25B6"; // ▶
        this.playBtn.addEventListener("click", () => this.togglePlay());
        this.el.appendChild(this.playBtn);
        // Slider
        this.slider = document.createElement("input");
        this.slider.type = "range";
        this.slider.min = "0";
        this.slider.max = String(Math.max(0, sync.getLength() - 1));
        this.slider.value = "0";
        this.slider.style.cssText = "flex:1;cursor:pointer;accent-color:#4af;";
        this.slider.addEventListener("input", () => {
            this.sync.pause();
            this.sync.seek(parseInt(this.slider.value, 10));
        });
        this.el.appendChild(this.slider);
        // Index / total label
        this.label = document.createElement("span");
        this.label.style.cssText = "min-width:80px;text-align:center;";
        this.label.textContent = `0 / ${sync.getLength()}`;
        this.el.appendChild(this.label);
        // Event type label
        this.eventLabel = document.createElement("span");
        this.eventLabel.style.cssText =
            "min-width:120px;text-align:left;color:#8af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        this.el.appendChild(this.eventLabel);
        // Speed button
        this.speedBtn = document.createElement("button");
        this.styleButton(this.speedBtn);
        this.speedBtn.textContent = "1x";
        this.speedBtn.addEventListener("click", () => this.cycleSpeed());
        this.el.appendChild(this.speedBtn);
        // Listen for seek changes
        sync.onSeek((cursor, entry) => {
            this.slider.value = String(cursor);
            this.label.textContent = `${cursor + 1} / ${sync.getLength()}`;
            this.eventLabel.textContent = entry.eventType;
            this.updatePlayBtn();
        });
    }
    styleButton(btn) {
        btn.style.cssText = [
            "background:rgba(255,255,255,0.1)",
            "border:1px solid rgba(255,255,255,0.2)",
            "color:#ccc",
            "border-radius:4px",
            "padding:4px 10px",
            "cursor:pointer",
            "font-family:monospace",
            "font-size:12px",
        ].join(";");
    }
    togglePlay() {
        if (this.sync.isPlaying()) {
            this.sync.pause();
        }
        else {
            // If at end, restart from beginning
            if (this.sync.getCursor() >= this.sync.getLength() - 1) {
                this.sync.seek(0);
            }
            this.sync.play();
        }
        this.updatePlayBtn();
    }
    updatePlayBtn() {
        this.playBtn.textContent = this.sync.isPlaying() ? "\u23F8" : "\u25B6"; // ⏸ or ▶
    }
    cycleSpeed() {
        const current = this.sync.getSpeed();
        const idx = SPEEDS.indexOf(current);
        const next = SPEEDS[(idx + 1) % SPEEDS.length];
        this.sync.setSpeed(next);
        this.speedBtn.textContent = `${next}x`;
    }
}
