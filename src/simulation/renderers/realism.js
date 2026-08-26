/**
 * Photoreal material, lighting and optics engine.
 *
 * Everything a student sees on the bench is drawn with a single, consistent
 * physical lighting model rather than as flat schematic shapes:
 *
 *   · one key light, fixed upper-left, so every specular highlight, every
 *     contact shadow and every caustic on the bench agrees about where the
 *     lab window is;
 *   · glass is rendered the way real borosilicate reads to the eye — a
 *     Fresnel-bright edge where you look through the wall almost tangentially,
 *     a dark internal wall band from total internal reflection, a soft
 *     specular streak, and a 3-D rim ellipse at the mouth;
 *   · liquid darkens with depth (Beer–Lambert: transmitted intensity falls as
 *     e^(-εcl), so a tall column of the same solution really is deeper in
 *     colour at the bottom), carries a concave meniscus against glass, and
 *     shows its top face in perspective instead of as a straight line.
 *
 * No physics is decided here — this module only draws. Quantities come from
 * src/simulation/models/*, motion of the free surface comes from
 * src/simulation/fluids.js. Nothing here touches the DOM beyond the canvas
 * context it is handed.
 */

/* ------------------------------------------------------------------ *
 *  Palette
 * ------------------------------------------------------------------ */

const THEMES = {
  classroom: {
    bg: '#f3f6fb', bg2: '#e8eef8', ink: '#12213a', muted: '#42597c', dim: '#7488a6',
    stroke: '#2a3c5c', glass: 'rgba(160,190,230,0.28)', glassStroke: 'rgba(30,50,90,0.55)',
    liquid: '#6fa8dc', liquidAlt: '#e07b39', metal: '#8b93a3', wood: '#a9754a',
    accent: '#1d5fd4', accent2: '#0d8f74', good: '#0d7a52', warn: '#8a5a00', bad: '#c02626',
    paper: '#fbf7ec', flame: '#ff8a3d', shadow: 'rgba(20,40,80,0.14)',
    /* Scene lighting — a bright north-facing lab window. */
    wall: '#dfe7f4', wallTop: '#eef3fa', benchTop: '#c7ced9', benchFront: '#a7b0bf',
    keyLight: 'rgba(255,255,255,0.95)', ambient: 'rgba(190,210,240,0.5)',
    isDark: false,
  },
  dark: {
    bg: '#0f1a2e', bg2: '#152238', ink: '#eef3fb', muted: '#b9c7de', dim: '#8497b8',
    stroke: '#c9d6ee', glass: 'rgba(120,160,220,0.16)', glassStroke: 'rgba(220,232,255,0.5)',
    liquid: '#4f8fe0', liquidAlt: '#e08a4f', metal: '#aab4c6', wood: '#c08a5a',
    accent: '#5b9bff', accent2: '#5fe0bd', good: '#3fd39b', warn: '#ffc266', bad: '#ff8080',
    paper: '#22314c', flame: '#ffb066', shadow: 'rgba(0,0,0,0.45)',
    wall: '#111d33', wallTop: '#16243c', benchTop: '#1b2942', benchFront: '#121d31',
    keyLight: 'rgba(200,225,255,0.75)', ambient: 'rgba(40,70,120,0.55)',
    isDark: true,
  },
};

let THEME = THEMES.classroom;

/** Switch the palette every renderer draws with. name: 'dark' | 'classroom'. */
export function setCanvasTheme(name) {
  THEME = name === 'dark' ? THEMES.dark : THEMES.classroom;
}

/** Current palette, for renderers needing a colour no helper covers. */
export function theme() { return THEME; }

/**
 * The key light, in normalised screen direction. Fixed for the whole app:
 * a highlight that wanders between apparatus is the single fastest way to
 * make a rendered scene look fake.
 */
export const LIGHT = { x: -0.5, y: -0.84 };

/* ------------------------------------------------------------------ *
 *  Clock — one time base for every animated material
 * ------------------------------------------------------------------ */

const T0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
let lastT = 0;
let frameDt = 1 / 60;

/** Seconds since load. Every flicker, ripple and shimmer reads this. */
export function clock() {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  return (now - T0) / 1000;
}

/**
 * Advance the shared frame clock. Called once per frame by fitCanvas, so
 * particle systems integrate against real elapsed time rather than assuming
 * 60 fps (a school Android at 34 fps would otherwise run every animation
 * at half speed). Clamped so a backgrounded tab cannot explode the sim.
 */
export function tickClock() {
  const t = clock();
  frameDt = lastT ? Math.min(0.05, Math.max(0.0005, t - lastT)) : 1 / 60;
  lastT = t;
  return frameDt;
}

/** Seconds elapsed in the current frame. */
export function dt() { return frameDt; }

/* ------------------------------------------------------------------ *
 *  Small maths
 * ------------------------------------------------------------------ */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

/** Smooth 1-D value noise in [0,1] — flame flicker, wobble, turbulence. */
export function noise1(x) {
  const i = Math.floor(x); const f = x - i;
  return lerp(hash(i), hash(i + 1), smoothstep(f));
}

/** Layered noise: more natural than a single octave for flame and smoke. */
export function fbm(x, octaves = 3) {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) { v += amp * noise1(x * freq); freq *= 2.07; amp *= 0.5; }
  return v;
}

/* ------------------------------------------------------------------ *
 *  Colour
 * ------------------------------------------------------------------ */

const rgbCache = new Map();

/** Parse '#rgb', '#rrggbb', 'rgb(...)' or 'rgba(...)' into {r,g,b,a}. */
export function toRGB(color) {
  if (!color) return { r: 120, g: 160, b: 220, a: 1 };
  const hit = rgbCache.get(color);
  if (hit) return hit;
  let out = { r: 120, g: 160, b: 220, a: 1 };
  const c = String(color).trim();
  if (c[0] === '#') {
    const hex = c.slice(1);
    if (hex.length === 3) {
      out = { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), a: 1 };
    } else if (hex.length >= 6) {
      out = { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
    }
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map((s) => parseFloat(s));
      out = { r: p[0] | 0, g: p[1] | 0, b: p[2] | 0, a: p.length > 3 ? p[3] : 1 };
    }
  }
  if (!Number.isFinite(out.r)) out = { r: 120, g: 160, b: 220, a: 1 };
  rgbCache.set(color, out);
  return out;
}

/** Same colour at a chosen opacity. */
export function rgba(color, a) {
  const c = toRGB(color);
  return `rgba(${c.r},${c.g},${c.b},${clamp(a * (c.a ?? 1), 0, 1)})`;
}

/** k > 0 lightens toward white, k < 0 darkens toward black. */
export function shade(color, k, a = 1) {
  const c = toRGB(color);
  const t = clamp(Math.abs(k), 0, 1);
  const to = k >= 0 ? 255 : 0;
  return `rgba(${Math.round(lerp(c.r, to, t))},${Math.round(lerp(c.g, to, t))},${Math.round(lerp(c.b, to, t))},${clamp(a * (c.a ?? 1), 0, 1)})`;
}

/** Blend two colours. */
export function mixColor(c1, c2, t, a = 1) {
  const A = toRGB(c1), B = toRGB(c2), k = clamp(t, 0, 1);
  return `rgba(${Math.round(lerp(A.r, B.r, k))},${Math.round(lerp(A.g, B.g, k))},${Math.round(lerp(A.b, B.b, k))},${a})`;
}

/**
 * Beer–Lambert: a solution of the same dye is visibly deeper in colour the
 * further light travels through it. `depth` in [0,1] is the fraction of the
 * column traversed; ε is a per-dye absorptivity.
 */
export function absorbed(color, depth, eps = 1.15) {
  const c = toRGB(color);
  const k = Math.exp(-eps * clamp(depth, 0, 1));
  return `rgb(${Math.round(c.r * (0.32 + 0.68 * k))},${Math.round(c.g * (0.32 + 0.68 * k))},${Math.round(c.b * (0.32 + 0.68 * k))})`;
}

/* ------------------------------------------------------------------ *
 *  Scene — the room the apparatus stands in
 * ------------------------------------------------------------------ */

/**
 * Lab backdrop: a wall falling into shadow away from the window, and a
 * bench top drawn in perspective with its front edge. Drawing the bench as
 * a surface rather than a single rule is what stops apparatus from looking
 * like it is floating in a void.
 */
export function backdrop(ctx, w, h, benchY) {
  const by = benchY ?? h * 0.82;
  ctx.save();
  // Wall, lit from the upper-left window.
  const wall = ctx.createLinearGradient(0, 0, w * 0.9, by);
  wall.addColorStop(0, THEME.wallTop);
  wall.addColorStop(1, THEME.wall);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, by);

  // Soft pool of window light on the wall behind the apparatus.
  const glow = ctx.createRadialGradient(w * 0.28, by * 0.12, 4, w * 0.28, by * 0.12, by * 1.5);
  glow.addColorStop(0, rgba(THEME.keyLight, THEME.isDark ? 0.1 : 0.55));
  glow.addColorStop(1, rgba(THEME.keyLight, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, by);

  // Bench top: a shallow trapezoid reads as a receding horizontal surface.
  const top = ctx.createLinearGradient(0, by - 2, 0, h);
  top.addColorStop(0, shade(THEME.benchTop, 0.16));
  top.addColorStop(0.18, THEME.benchTop);
  top.addColorStop(1, THEME.benchFront);
  ctx.fillStyle = top;
  ctx.fillRect(0, by, w, h - by);

  // Front lip catches the key light.
  ctx.strokeStyle = rgba(THEME.keyLight, THEME.isDark ? 0.14 : 0.6);
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, by + 0.7); ctx.lineTo(w, by + 0.7); ctx.stroke();
  ctx.strokeStyle = rgba('#000', THEME.isDark ? 0.35 : 0.1);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, by + 2.4); ctx.lineTo(w, by + 2.4); ctx.stroke();
  ctx.restore();
  return by;
}

/** Darkens the frame edges so the eye is pulled to the apparatus. */
export function vignette(ctx, w, h) {
  ctx.save();
  const g = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.34, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, THEME.isDark ? 'rgba(0,0,0,0.42)' : 'rgba(18,33,58,0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Shadows and light spill
 * ------------------------------------------------------------------ */

/**
 * Soft contact shadow under an object standing on the bench. Offset along
 * the key-light direction and elongated, the way a real shadow from a high
 * side window falls.
 */
export function contactShadow(ctx, cx, groundY, width, opts = {}) {
  const { strength = 1, spread = 1 } = opts;
  const rx = (width / 2) * 1.22 * spread;
  const ry = Math.max(3, width * 0.115) * spread;
  const ox = -LIGHT.x * width * 0.28;
  ctx.save();
  const g = ctx.createRadialGradient(cx + ox, groundY, 1, cx + ox, groundY, rx);
  g.addColorStop(0, rgba(THEME.isDark ? '#000' : '#16294a', 0.42 * strength));
  g.addColorStop(0.55, rgba(THEME.isDark ? '#000' : '#16294a', 0.17 * strength));
  g.addColorStop(1, rgba(THEME.isDark ? '#000' : '#16294a', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx + ox, groundY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Caustic: light refracted by a filled vessel converges into a bright,
 * coloured pool on the bench beside its shadow. This is the cue that tells
 * the eye a vessel contains liquid and not air.
 */
export function caustic(ctx, cx, groundY, width, color, opts = {}) {
  const { strength = 1 } = opts;
  if (strength <= 0.01) return;
  const rx = width * 0.44;
  const ox = -LIGHT.x * width * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx + ox, groundY, 1, cx + ox, groundY, rx);
  g.addColorStop(0, rgba(color, 0.4 * strength));
  g.addColorStop(0.5, rgba(color, 0.14 * strength));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx + ox, groundY, rx, rx * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Additive glow — flames, lamp filaments, glowing wire, indicator LEDs. */
export function bloom(ctx, x, y, r, color, intensity = 1) {
  if (r <= 0 || intensity <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, 0.62 * intensity));
  g.addColorStop(0.35, rgba(color, 0.24 * intensity));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Glass
 * ------------------------------------------------------------------ */

/**
 * Paint a closed path as borosilicate glass.
 *
 * `path(ctx)` must trace the vessel's silhouette; the box gives the extent
 * so the gradients know where the walls are. Four physical effects, in the
 * order light meets them:
 *
 *   1. body tint      — the faint green-blue of thick glass;
 *   2. Fresnel edges  — near the silhouette you look along the wall, so the
 *                       path length through glass is long and the edge goes
 *                       bright and dense;
 *   3. specular       — the window reflected in the front surface;
 *   4. inner shading  — light lost to total internal reflection on the far
 *                       wall, which reads as a soft dark band.
 */
export function glassBody(ctx, path, box, opts = {}) {
  const { x0, x1, top, bot } = box;
  const { wall = 2.2, tintStrength = 1, stroke = true } = opts;
  const w = x1 - x0;
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();

  // 1. Body tint + vertical falloff.
  const body = ctx.createLinearGradient(0, top, 0, bot);
  body.addColorStop(0, rgba(THEME.glass, 0.55 * tintStrength));
  body.addColorStop(0.5, rgba(THEME.glass, 0.85 * tintStrength));
  body.addColorStop(1, rgba(THEME.glass, 1.0 * tintStrength));
  ctx.fillStyle = body;
  ctx.fillRect(x0 - 4, top - 4, w + 8, bot - top + 8);

  // 2. Fresnel edge bands.
  const edge = ctx.createLinearGradient(x0, 0, x1, 0);
  const eCol = THEME.isDark ? '#cfe0ff' : '#20375c';
  edge.addColorStop(0, rgba(eCol, 0.34));
  edge.addColorStop(wall / w, rgba(eCol, 0.1));
  edge.addColorStop(0.5, rgba(eCol, 0.0));
  edge.addColorStop(1 - wall / w, rgba(eCol, 0.1));
  edge.addColorStop(1, rgba(eCol, 0.34));
  ctx.fillStyle = edge;
  ctx.fillRect(x0 - 4, top - 4, w + 8, bot - top + 8);

  // 3. Specular streak: the window, reflected. Two — one broad and soft,
  //    one narrow and sharp — because a real pane has a bright frame edge.
  const sx = x0 + w * 0.22;
  const spec = ctx.createLinearGradient(sx - w * 0.1, 0, sx + w * 0.12, 0);
  spec.addColorStop(0, 'rgba(255,255,255,0)');
  spec.addColorStop(0.5, `rgba(255,255,255,${THEME.isDark ? 0.2 : 0.5})`);
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(sx - w * 0.1, top + (bot - top) * 0.04, w * 0.22, (bot - top) * 0.88);

  ctx.fillStyle = `rgba(255,255,255,${THEME.isDark ? 0.26 : 0.62})`;
  ctx.fillRect(x0 + w * 0.78, top + (bot - top) * 0.1, Math.max(0.9, w * 0.018), (bot - top) * 0.7);

  // 4. Inner wall shading near the base, where the far wall curves away.
  const inner = ctx.createLinearGradient(0, bot - (bot - top) * 0.3, 0, bot);
  inner.addColorStop(0, 'rgba(0,0,0,0)');
  inner.addColorStop(1, rgba(THEME.isDark ? '#000' : '#1a2c4c', 0.16));
  ctx.fillStyle = inner;
  ctx.fillRect(x0 - 4, bot - (bot - top) * 0.3, w + 8, (bot - top) * 0.3 + 4);
  ctx.restore();

  if (stroke) {
    ctx.save();
    ctx.strokeStyle = THEME.glassStroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); path(ctx); ctx.stroke();
    ctx.restore();
  }
}

/**
 * The mouth of a vessel, drawn as an ellipse rather than a straight line.
 * A cylinder seen slightly from above shows its opening; without this a
 * beaker is just a rectangle. `squash` is the viewing foreshortening.
 */
export function rimEllipse(ctx, cx, y, rx, opts = {}) {
  const { squash = 0.17, thickness = 2.4, open = true } = opts;
  const ry = Math.max(1.6, rx * squash);
  ctx.save();
  // Inside of the vessel, seen through the mouth.
  if (open) {
    const g = ctx.createLinearGradient(0, y - ry, 0, y + ry);
    g.addColorStop(0, rgba(THEME.isDark ? '#0a1220' : '#2c4067', 0.3));
    g.addColorStop(1, rgba(THEME.isDark ? '#0a1220' : '#2c4067', 0.08));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  // The ground glass rim itself: bright where the key light grazes it.
  ctx.lineWidth = thickness;
  const rim = ctx.createLinearGradient(cx - rx, y, cx + rx, y);
  rim.addColorStop(0, `rgba(255,255,255,${THEME.isDark ? 0.5 : 0.9})`);
  rim.addColorStop(0.45, rgba(THEME.glassStroke, 0.75));
  rim.addColorStop(1, `rgba(255,255,255,${THEME.isDark ? 0.35 : 0.7})`);
  ctx.strokeStyle = rim;
  ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  return ry;
}

/* ------------------------------------------------------------------ *
 *  Liquid
 * ------------------------------------------------------------------ */

/**
 * The body of a liquid column, darkening with depth (Beer–Lambert) and
 * carrying the vertical brightening near the front wall where light enters.
 * `surface` returns the y of the free surface at a given x, so a sloshing
 * or rippled surface can be passed straight in from fluids.js.
 */
export function liquidColumn(ctx, box, color, opts = {}) {
  const { x0, x1, bot } = box;
  const { surface, level, alpha = 0.88, eps = 1.05, radiusBottom = 5 } = opts;
  const w = x1 - x0;
  const topY = level;
  if (bot - topY <= 0.5) return;

  ctx.save();
  ctx.beginPath();
  // Free surface, sampled left → right so waves are honoured.
  const steps = Math.max(8, Math.min(64, Math.round(w / 3)));
  ctx.moveTo(x0, surface ? surface(0) : topY);
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    ctx.lineTo(x0 + w * f, surface ? surface(f) : topY);
  }
  ctx.lineTo(x1, bot - radiusBottom);
  if (radiusBottom > 0) ctx.quadraticCurveTo(x1, bot, x1 - radiusBottom, bot);
  ctx.lineTo(x0 + radiusBottom, bot);
  if (radiusBottom > 0) ctx.quadraticCurveTo(x0, bot, x0, bot - radiusBottom);
  ctx.closePath();
  ctx.clip();

  const depth = ctx.createLinearGradient(0, topY, 0, bot);
  depth.addColorStop(0, rgba(absorbed(color, 0.02, eps), alpha * 0.9));
  depth.addColorStop(0.45, rgba(absorbed(color, 0.45, eps), alpha));
  depth.addColorStop(1, rgba(absorbed(color, 1, eps), Math.min(1, alpha * 1.06)));
  ctx.fillStyle = depth;
  ctx.fillRect(x0 - 2, topY - 6, w + 4, bot - topY + 8);

  // Light entering the front face scatters — a soft bright column.
  const scatter = ctx.createLinearGradient(x0, 0, x1, 0);
  scatter.addColorStop(0, rgba('#ffffff', 0));
  scatter.addColorStop(0.24, rgba('#ffffff', THEME.isDark ? 0.07 : 0.17));
  scatter.addColorStop(0.55, rgba('#ffffff', 0));
  ctx.fillStyle = scatter;
  ctx.fillRect(x0 - 2, topY - 6, w + 4, bot - topY + 8);

  // Denser, darker skin against the glass walls.
  const walls = ctx.createLinearGradient(x0, 0, x1, 0);
  walls.addColorStop(0, rgba(absorbed(color, 1, eps), 0.5));
  walls.addColorStop(0.14, rgba(color, 0));
  walls.addColorStop(0.86, rgba(color, 0));
  walls.addColorStop(1, rgba(absorbed(color, 1, eps), 0.5));
  ctx.fillStyle = walls;
  ctx.fillRect(x0 - 2, topY - 6, w + 4, bot - topY + 8);
  ctx.restore();
}

/**
 * The free surface seen in perspective: an ellipse, brighter on the far
 * lip where it catches the window, with the concave meniscus that water
 * pulls up against clean glass (contact angle < 90°).
 */
export function liquidSurface(ctx, cx, y, rx, color, opts = {}) {
  const { squash = 0.17, wave = 0, meniscus = true, sheen = 1 } = opts;
  const ry = Math.max(1.2, rx * squash);
  ctx.save();
  // Top face.
  const face = ctx.createLinearGradient(cx - rx, y - ry, cx + rx * 0.4, y + ry);
  face.addColorStop(0, shade(color, 0.34, 0.95));
  face.addColorStop(0.5, rgba(color, 0.95));
  face.addColorStop(1, shade(color, -0.2, 0.95));
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();

  // Specular sheen sliding with the surface motion.
  if (sheen > 0) {
    const sx = cx - rx * 0.34 + wave * rx * 0.16;
    const g = ctx.createRadialGradient(sx, y - ry * 0.3, 0, sx, y - ry * 0.3, rx * 0.62);
    g.addColorStop(0, `rgba(255,255,255,${(THEME.isDark ? 0.28 : 0.6) * sheen})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Meniscus: the wetted film climbing the wall, and the dark line under it.
  if (meniscus) {
    ctx.strokeStyle = rgba(shade(color, -0.4), 0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - rx, y - ry * 0.55);
    ctx.quadraticCurveTo(cx, y + ry * 1.05, cx + rx, y - ry * 0.55);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${THEME.isDark ? 0.22 : 0.5})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - rx, y - ry * 0.85);
    ctx.quadraticCurveTo(cx, y + ry * 0.55, cx + rx, y - ry * 0.85);
    ctx.stroke();
  }
  ctx.restore();
  return ry;
}

/* ------------------------------------------------------------------ *
 *  Metal, plastic, wood
 * ------------------------------------------------------------------ */

/**
 * Brushed / turned metal. The anisotropic highlight — a hard bright band
 * running along the tool marks with dark either side — is what separates
 * steel from flat grey.
 */
export function brushedMetal(ctx, x, y, w, h, opts = {}) {
  const { axis = 'v', base = THEME.metal, radius = 0 } = opts;
  ctx.save();
  const g = axis === 'v'
    ? ctx.createLinearGradient(x, 0, x + w, 0)
    : ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(base, -0.42));
  g.addColorStop(0.16, shade(base, -0.06));
  g.addColorStop(0.3, shade(base, 0.58));
  g.addColorStop(0.42, shade(base, 0.1));
  g.addColorStop(0.68, shade(base, -0.3));
  g.addColorStop(0.86, shade(base, 0.16));
  g.addColorStop(1, shade(base, -0.46));
  ctx.fillStyle = g;
  ctx.beginPath();
  if (radius > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.strokeStyle = rgba('#0a1424', 0.35);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

/** Polished chrome — clamps, bosses, stopcock barrels, screw heads. */
export function chrome(ctx, x, y, w, h, radius = 2) {
  brushedMetal(ctx, x, y, w, h, { base: '#b9c2d0', radius });
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x + w * 0.18, y + 1, Math.max(0.8, w * 0.08), Math.max(0, h - 2));
  ctx.restore();
}

/** Matte moulded plastic / bakelite — instrument cases, cell bodies. */
export function plastic(ctx, x, y, w, h, color, radius = 3) {
  ctx.save();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(color, 0.3));
  g.addColorStop(0.42, color);
  g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g;
  ctx.beginPath();
  if (radius > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.5, 0.7);
  ctx.lineWidth = 0.9;
  ctx.stroke();
  // Top bevel.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x + 1.5, y + 1, Math.max(0, w - 3), 1);
  ctx.restore();
}

/** Cork / rubber bung. */
export function cork(ctx, cx, y, wTop, wBot, h) {
  ctx.save();
  const g = ctx.createLinearGradient(cx - wTop / 2, 0, cx + wTop / 2, 0);
  g.addColorStop(0, '#8a6234');
  g.addColorStop(0.3, '#c39257');
  g.addColorStop(0.7, '#a97a44');
  g.addColorStop(1, '#75512a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - wTop / 2, y);
  ctx.lineTo(cx + wTop / 2, y);
  ctx.lineTo(cx + wBot / 2, y + h);
  ctx.lineTo(cx - wBot / 2, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,38,16,0.6)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Flame — a real premixed burner flame has two cones
 * ------------------------------------------------------------------ */

/**
 * Bunsen flame. With the air-hole open the flame is premixed and shows a
 * sharp inner cone of unburnt gas inside a pale blue outer envelope, the
 * hottest point being just above the inner cone tip; with the air-hole shut
 * combustion is incomplete and the luminous yellow sooting flame appears.
 * `air` in [0,1] moves continuously between the two.
 */
export function flame(ctx, cx, baseY, height, opts = {}) {
  const { air = 1, t = clock(), intensity = 1 } = opts;
  if (height <= 1 || intensity <= 0.01) return;
  const flick = 1 + (fbm(t * 5.5) - 0.5) * 0.13;
  const sway = (fbm(t * 3.1 + 40) - 0.5) * height * 0.055;
  const H = height * flick;
  const wBase = Math.max(4, height * 0.2);
  const hot = clamp(air, 0, 1);

  const envelope = (scale, dx) => {
    ctx.beginPath();
    ctx.moveTo(cx - wBase * scale * 0.5, baseY);
    ctx.quadraticCurveTo(cx - wBase * scale * 0.62 + dx, baseY - H * scale * 0.55,
      cx + sway * scale + dx, baseY - H * scale);
    ctx.quadraticCurveTo(cx + wBase * scale * 0.62 + dx, baseY - H * scale * 0.55,
      cx + wBase * scale * 0.5, baseY);
    ctx.closePath();
  };

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Outer envelope — blue when premixed, orange when starved of air.
  const outerCol = mixColor('#ff9c3a', '#7fb6ff', hot);
  const og = ctx.createLinearGradient(0, baseY, 0, baseY - H);
  og.addColorStop(0, rgba(outerCol, 0.7 * intensity));
  og.addColorStop(0.55, rgba(outerCol, 0.42 * intensity));
  og.addColorStop(1, rgba(outerCol, 0));
  ctx.fillStyle = og;
  envelope(1, 0); ctx.fill();

  // Luminous sooting body — only when the air hole is closed.
  if (hot < 0.95) {
    const lum = ctx.createLinearGradient(0, baseY, 0, baseY - H * 0.92);
    lum.addColorStop(0, rgba('#ffcf5a', 0.72 * (1 - hot) * intensity));
    lum.addColorStop(0.5, rgba('#ff9b2e', 0.5 * (1 - hot) * intensity));
    lum.addColorStop(1, rgba('#ff7a1a', 0));
    ctx.fillStyle = lum;
    envelope(0.86, sway * 0.4); ctx.fill();
  }

  // Inner cone of unburnt gas — sharp, and only with air.
  if (hot > 0.15) {
    const ic = ctx.createLinearGradient(0, baseY, 0, baseY - H * 0.42);
    ic.addColorStop(0, rgba('#39e6ff', 0.55 * hot * intensity));
    ic.addColorStop(1, rgba('#1f7fff', 0));
    ctx.fillStyle = ic;
    envelope(0.42, 0); ctx.fill();
  }

  // Base collar where the gas leaves the barrel.
  ctx.fillStyle = rgba(hot > 0.5 ? '#5fa8ff' : '#ffb14d', 0.5 * intensity);
  ctx.beginPath();
  ctx.ellipse(cx, baseY, wBase * 0.5, wBase * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The flame lights the bench around it.
  bloom(ctx, cx, baseY - H * 0.42, H * 0.95,
    hot > 0.5 ? '#6fb4ff' : '#ff9c3a', 0.5 * intensity);
}

/** Radiant glow of a hot body — heated wire, filament, glowing crucible. */
export function incandescence(ctx, x, y, r, tempFrac, opts = {}) {
  const k = clamp(tempFrac, 0, 1);
  if (k <= 0.02) return;
  // Rough Planckian sweep: dull red → orange → white.
  const col = k < 0.5 ? mixColor('#8c1a05', '#ff7a12', k / 0.5) : mixColor('#ff7a12', '#fff2cf', (k - 0.5) / 0.5);
  bloom(ctx, x, y, r * (1.6 + k), col, (0.4 + k * 0.7) * (opts.intensity ?? 1));
}

/* ------------------------------------------------------------------ *
 *  Instrument surfaces
 * ------------------------------------------------------------------ */

/** Enamelled instrument dial face, with the glass cover reflection. */
export function dialFace(ctx, cx, cy, r) {
  ctx.save();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  g.addColorStop(0, THEME.isDark ? '#2b3852' : '#ffffff');
  g.addColorStop(0.75, THEME.isDark ? '#1d2942' : '#f4f7fc');
  g.addColorStop(1, THEME.isDark ? '#162034' : '#dde5f1');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // Cover glass: a diagonal reflection across the upper-left.
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const s = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy + r * 0.6);
  s.addColorStop(0, `rgba(255,255,255,${THEME.isDark ? 0.14 : 0.55})`);
  s.addColorStop(0.42, 'rgba(255,255,255,0.04)');
  s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.restore();
}

/** Backlit LCD/LED panel, as on a digital balance or multimeter. */
export function lcdPanel(ctx, x, y, w, h, opts = {}) {
  const { lit = true, tint = '#0f3b2e' } = opts;
  ctx.save();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, lit ? shade(tint, 0.22) : '#243043');
  g.addColorStop(1, lit ? shade(tint, -0.25) : '#1a2434');
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 3); else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Anti-glare sheen across the top third.
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), h * 0.32);
  ctx.restore();
}
