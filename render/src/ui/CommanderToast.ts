const QUOTES = [
  "Commander on the field.",
  "A new commander has arrived.",
  "Ready for orders.",
  "Deploy and conquer.",
  "The commander stands ready.",
  "All units, attention.",
  "Command accepted.",
  "Reporting for duty.",
  "For glory and code.",
  "The commander emerges.",
  "Steel your resolve.",
  "Execute without hesitation.",
];

export class CommanderToast {
  readonly el: HTMLDivElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText = [
      "position:fixed",
      "top:28%",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:30",
      "font-family:monospace",
      "font-size:15px",
      "font-weight:bold",
      "letter-spacing:3px",
      "text-transform:uppercase",
      "color:#c8a96e",
      "text-shadow:0 0 12px rgba(200,169,110,0.5)",
      "background:rgba(5,5,15,0.88)",
      "border:1px solid rgba(100,90,50,0.7)",
      "border-radius:2px",
      "padding:10px 22px",
      "pointer-events:none",
      "opacity:0",
      "transition:opacity 200ms ease-in-out",
      "white-space:nowrap",
    ].join(";");
  }

  show() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    this.el.textContent = `\u25b6 ${quote}`;
    this.el.style.opacity = "1";

    // Fade out after 700ms (transition is 200ms → total ~900ms ≈ 1s)
    this.timer = setTimeout(() => {
      this.el.style.opacity = "0";
      this.timer = null;
    }, 700);
  }
}
