import { DEFAULT_PACK } from "../config.js";

const PACKS = [
    { value: "default", label: "Default" },
    { value: "peon", label: "Peon (Warcraft)" },
];

export class PackSelector {
    readonly el: HTMLDivElement;
    private select: HTMLSelectElement;

    constructor(initialPack: string = DEFAULT_PACK) {
        this.el = document.createElement("div");
        this.el.style.cssText = [
            "position:fixed",
            "bottom:8px",
            "left:8px",
            "z-index:100",
            "font-family:monospace",
            "font-size:11px",
            "background:rgba(5,5,12,0.88)",
            "padding:4px 8px",
            "border-radius:4px",
            "border:1px solid #334",
            "display:flex",
            "align-items:center",
            "gap:6px",
            "color:#778",
        ].join(";");

        const label = document.createElement("span");
        label.textContent = "PACK:";
        label.style.letterSpacing = "1px";
        this.el.appendChild(label);

        this.select = document.createElement("select");
        this.select.style.cssText = [
            "background:#112",
            "border:1px solid #445",
            "color:#ccd",
            "font-family:monospace",
            "font-size:11px",
            "border-radius:2px",
            "padding:2px",
            "cursor:pointer",
        ].join(";");

        PACKS.forEach(({ value, label }) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            if (value === initialPack) option.selected = true;
            this.select.appendChild(option);
        });

        this.select.addEventListener("change", () => {
            this.setPack(this.select.value);
        });

        this.el.appendChild(this.select);
    }

    private setPack(packName: string) {
        const url = new URL(window.location.href);
        if (packName === DEFAULT_PACK) {
            url.searchParams.delete("pack");
        } else {
            url.searchParams.set("pack", packName);
        }
        window.location.href = url.toString();
    }
}
