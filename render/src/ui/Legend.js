// Terrain entries: semantic descriptions of what each region type represents.
// Colors mirrored from ColorUtils.ts TERRAIN_FILL / TERRAIN_BORDER.
const TERRAIN_ENTRIES = [
    { label: "source", desc: "src / lib", fill: "#1e4a1e", border: "#3a8a3a" },
    { label: "test", desc: "test / __tests__", fill: "#502818", border: "#9a6030" },
    { label: "config", desc: ".folders / config", fill: "#404040", border: "#707070" },
    { label: "docs", desc: "docs / markdown", fill: "#504a28", border: "#8a8030" },
    { label: "build", desc: "dist / build", fill: "#3a3a58", border: "#6060a0" },
    { label: "assets", desc: "images / fonts", fill: "#3a1e4e", border: "#8030a0" },
    { label: "external", desc: "web / external", fill: "#1e3e54", border: "#3070a0" },
    { label: "base", desc: "repo root", fill: "#3a3a58", border: "#7070b0" },
];
// Unit entries: shape SVG path data + what agent type spawns it.
// Shapes from assets/packs/placeholder/manifest.json, scaled for ~16px viewBox.
const UNIT_ENTRIES = [
    { shape: "circle", label: "commander", desc: "Claude session" },
    { shape: "diamond", label: "scout", desc: "Explore agent" },
    { shape: "square", label: "warrior", desc: "Bash agent" },
    { shape: "triangle", label: "strategist", desc: "Plan agent" },
    { shape: "pentagon", label: "soldier", desc: "general-purpose" },
    { shape: "hexagon", label: "specialist", desc: "other agents" },
];
function shapeSVG(shape) {
    const s = 7; // half-size in px (svg is 16x16, center at 8,8)
    const c = 8;
    switch (shape) {
        case "circle":
            return `<circle cx="${c}" cy="${c}" r="${s}" fill="#ccd"/>`;
        case "diamond":
            return `<polygon points="${c},${c - s} ${c + s},${c} ${c},${c + s} ${c - s},${c}" fill="#ccd"/>`;
        case "square":
            return `<rect x="${c - s}" y="${c - s}" width="${s * 2}" height="${s * 2}" fill="#ccd"/>`;
        case "triangle":
            return `<polygon points="${c},${c - s} ${c + s},${c + s} ${c - s},${c + s}" fill="#ccd"/>`;
        case "pentagon": {
            const pts = Array.from({ length: 5 }, (_, i) => {
                const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
                return `${(c + Math.cos(a) * s).toFixed(1)},${(c + Math.sin(a) * s).toFixed(1)}`;
            });
            return `<polygon points="${pts.join(" ")}" fill="#ccd"/>`;
        }
        case "hexagon": {
            const pts = Array.from({ length: 6 }, (_, i) => {
                const a = (Math.PI * 2 * i) / 6;
                return `${(c + Math.cos(a) * s).toFixed(1)},${(c + Math.sin(a) * s).toFixed(1)}`;
            });
            return `<polygon points="${pts.join(" ")}" fill="#ccd"/>`;
        }
        default:
            return "";
    }
}
export class Legend {
    el;
    constructor() {
        this.el = document.createElement("div");
        this.el.style.cssText = [
            "position:fixed",
            "top:8px",
            "left:8px",
            "z-index:10",
            "font-family:monospace",
            "font-size:11px",
            "border-radius:4px",
            "overflow:hidden",
            "border:1px solid #334",
            "pointer-events:none",
            "min-width:160px",
        ].join(";");
        this.el.appendChild(this.makeHeader("LEGEND"));
        this.el.appendChild(this.makeTerrainSection());
        this.el.appendChild(this.makeUnitSection());
    }
    makeHeader(text) {
        const el = document.createElement("div");
        el.style.cssText = [
            "padding:5px 10px",
            "background:rgba(10,10,20,0.92)",
            "color:#778",
            "font-size:10px",
            "letter-spacing:1px",
            "text-transform:uppercase",
            "border-bottom:1px solid #334",
        ].join(";");
        el.textContent = text;
        return el;
    }
    makeSection(title, rows) {
        const section = document.createElement("div");
        section.style.cssText = "background:rgba(5,5,12,0.88);padding:6px 8px;";
        const label = document.createElement("div");
        label.style.cssText = [
            "color:#667",
            "font-size:9px",
            "letter-spacing:1px",
            "text-transform:uppercase",
            "margin-bottom:4px",
        ].join(";");
        label.textContent = title;
        section.appendChild(label);
        for (const row of rows)
            section.appendChild(row);
        return section;
    }
    makeRow(swatch, desc) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;padding:2px 0;";
        const text = document.createElement("span");
        text.style.cssText = "color:#ccd;";
        text.textContent = desc;
        row.appendChild(swatch);
        row.appendChild(text);
        return row;
    }
    makeTerrainSection() {
        const rows = TERRAIN_ENTRIES.map(({ desc, fill, border }) => {
            const swatch = document.createElement("div");
            swatch.style.cssText = [
                "width:14px",
                "height:14px",
                "flex-shrink:0",
                "border-radius:2px",
                `background:${fill}`,
                `border:1px solid ${border}`,
            ].join(";");
            return this.makeRow(swatch, desc);
        });
        return this.makeSection("Regions", rows);
    }
    makeUnitSection() {
        const rows = UNIT_ENTRIES.map(({ shape, label, desc }) => {
            const swatch = document.createElement("div");
            swatch.style.cssText = "width:16px;height:16px;flex-shrink:0;";
            swatch.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16">${shapeSVG(shape)}</svg>`;
            const row = this.makeRow(swatch, desc);
            // Prepend the unit type name in dimmer color
            const name = document.createElement("span");
            name.style.cssText = "color:#778;width:62px;flex-shrink:0;";
            name.textContent = label;
            row.insertBefore(name, row.children[1]);
            return row;
        });
        return this.makeSection("Units", rows);
    }
}
