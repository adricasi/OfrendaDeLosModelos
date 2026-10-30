/**
 * Motion that CSS cannot do alone: a canvas of drifting marigold petals and a few Web
 * Animations API effects. No libraries. Everything here stays off while the visitor prefers
 * reduced motion, and that preference is re-checked whenever it changes. The CSS side (flicker,
 * sway, breathing) is switched off by one rule in the reduced-motion block of the stylesheet.
 */

const REDUCED = "(prefers-reduced-motion: reduce)";

type MediaSource = Pick<Window, "matchMedia">;

export function prefersReducedMotion(win: MediaSource | null = window): boolean {
  if (win === null || typeof win.matchMedia !== "function") return false;
  return win.matchMedia(REDUCED).matches;
}

/** Calls `listener` whenever the reduced-motion preference changes. Returns a stop function. */
export function onReducedMotionChange(
  listener: (reduced: boolean) => void,
  win: MediaSource | null = window,
): () => void {
  if (win === null || typeof win.matchMedia !== "function") return () => undefined;
  const query = win.matchMedia(REDUCED);
  const handler = (): void => {
    listener(query.matches);
  };
  query.addEventListener("change", handler);
  return () => {
    query.removeEventListener("change", handler);
  };
}

function canAnimate(element: Element): boolean {
  return typeof element.animate === "function" && !prefersReducedMotion();
}

/** The candle of the speaking ancestor flares up once, then settles into its flicker. */
export function flare(place: Element): void {
  const flame = place.querySelector(".place-candle .flame");
  if (flame === null || !canAnimate(flame)) return;
  flame.animate(
    [
      { transform: "scale(0.6, 0.5)", opacity: 0.4 },
      { transform: "scale(1.5, 1.7)", opacity: 1, offset: 0.35 },
      { transform: "scale(1, 1)", opacity: 1 },
    ],
    { duration: 1100, easing: "cubic-bezier(.2,.7,.3,1)" },
  );
  const light = place.querySelector(".portrait");
  light?.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 1400, easing: "ease-out" });
}

/** Staggered entrance for what the ancestors say: each element rises into place in turn. */
export function stagger(elements: readonly Element[], step = 140): void {
  elements.forEach((element, index) => {
    if (!canAnimate(element)) return;
    element.animate(
      [
        { opacity: 0, transform: "translateY(0.6rem)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 520, delay: index * step, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" },
    );
  });
}

/**
 * A calaverita card is set down on the altar: it drops, lands slightly crooked and settles.
 * Transform only: the card is fully opaque from the first frame, so its text keeps its contrast.
 */
export function placeCard(card: Element, index: number): void {
  if (!canAnimate(card)) return;
  const tilt = index % 2 === 0 ? -1.2 : 1.1;
  card.animate(
    [
      { transform: `translateY(-1.1rem) rotate(${String(tilt * 4)}deg)` },
      {
        opacity: 1,
        transform: `translateY(0.12rem) rotate(${String(tilt * 0.6)}deg)`,
        offset: 0.7,
      },
      { transform: `translateY(0) rotate(${String(tilt)}deg)` },
    ],
    { duration: 720, delay: index * 220, easing: "cubic-bezier(.3,.7,.3,1)", fill: "backwards" },
  );
}

/* ------------------------------------------------------------------ drifting petals */

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  spin: number;
  angle: number;
  seed: number;
  tone: number;
}

/** Smooth 1-D value noise in [-1, 1]. */
function noise(x: number): number {
  const hash = (n: number): number => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

const PETAL_TOKENS = ["--marigold", "--marigold-deep", "--marigold-light"] as const;

export interface PetalDrift {
  readonly stop: () => void;
}

/**
 * Drifts 20 to 40 petals across `canvas`, pushed by a slow value-noise wind. One small canvas,
 * paused when the tab is hidden, stopped and cleared while reduced motion is on.
 */
export function startPetalDrift(canvas: HTMLCanvasElement, win: Window = window): PetalDrift {
  const context = canvas.getContext("2d");
  if (context === null) return { stop: () => undefined };
  const ctx = context;

  // Colours come from the stylesheet tokens, not from literals here.
  const style = win.getComputedStyle(canvas);
  const tones = PETAL_TOKENS.map((name) => style.getPropertyValue(name).trim() || "orange");
  let particles: Particle[] = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let running = false;

  const random = ((): (() => number) => {
    let state = 20261030;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  })();

  const resize = (): void => {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(2, win.devicePixelRatio || 1);
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = width < 600 ? 20 : 34;
    particles = Array.from({ length: count }, () => ({
      x: random() * width,
      y: random() * height,
      size: 4 + random() * 5,
      speed: 10 + random() * 16,
      spin: (random() - 0.5) * 2.2,
      angle: random() * Math.PI * 2,
      seed: random() * 100,
      tone: Math.floor(random() * 3),
    }));
  };

  const draw = (now: number): void => {
    frame = 0;
    if (!running) return;
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += seconds;
    ctx.clearRect(0, 0, width, height);
    for (const particle of particles) {
      const wind =
        noise(clock * 0.15 + particle.y * 0.004) * 26 + noise(clock * 0.5 + particle.seed) * 8;
      particle.x += (wind + 6) * seconds;
      particle.y += particle.speed * seconds;
      particle.angle += particle.spin * seconds;
      if (particle.y > height + 12) {
        particle.y = -12;
        particle.x = random() * width;
      }
      if (particle.x > width + 12) particle.x = -12;
      if (particle.x < -12) particle.x = width + 12;
      // A petal turning in the air: its width follows the sine of its angle.
      const flat = Math.abs(Math.sin(particle.angle * 0.7));
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.angle);
      ctx.scale(0.45 + flat * 0.55, 1);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = tones[particle.tone] ?? "orange";
      ctx.beginPath();
      ctx.ellipse(0, 0, particle.size * 0.55, particle.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    frame = win.requestAnimationFrame(draw);
  };

  const start = (): void => {
    if (running || prefersReducedMotion(win) || win.document.hidden) return;
    running = true;
    last = win.performance.now();
    frame = win.requestAnimationFrame(draw);
  };
  const pause = (): void => {
    running = false;
    if (frame !== 0) win.cancelAnimationFrame(frame);
    frame = 0;
  };

  resize();
  const onVisibility = (): void => {
    if (win.document.hidden) pause();
    else start();
  };
  const onResize = (): void => {
    resize();
  };
  const stopWatching = onReducedMotionChange((reduced) => {
    if (reduced) {
      pause();
      ctx.clearRect(0, 0, width, height);
    } else start();
  }, win);
  win.document.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("resize", onResize);
  start();

  return {
    stop: () => {
      pause();
      stopWatching();
      win.document.removeEventListener("visibilitychange", onVisibility);
      win.removeEventListener("resize", onResize);
    },
  };
}
