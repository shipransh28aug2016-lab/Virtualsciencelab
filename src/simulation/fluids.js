/**
 * Real-time fluid dynamics for the bench.
 *
 * This module does not decorate — it integrates. Every motion a student
 * sees on the canvas comes out of the governing equation for that motion:
 *
 *   · free surface      — the 1-D wave equation  ∂²η/∂t² = c²∂²η/∂x² − γ ∂η/∂t,
 *                         solved explicitly, so a drop landing in a flask
 *                         sends real ripples out to the walls and they
 *                         reflect back, interfere, and damp away;
 *   · falling drops     — y¨ = g, released at the burette's real delivery
 *                         rate, coupling their momentum into the wave field
 *                         when they land;
 *   · rising bubbles    — buoyancy against Stokes drag, so small bubbles
 *                         genuinely rise more slowly than large ones
 *                         (v_t ∝ r² for the creeping-flow regime);
 *   · settling solids   — the same law with the density difference reversed,
 *                         which is why a fine precipitate takes minutes and
 *                         a coarse one seconds;
 *   · mixing            — advection–diffusion of a dye concentration, so a
 *                         reagent stirred into a beaker spreads at a rate
 *                         set by the diffusivity and the stirring rate;
 *   · plumes            — buoyant rise with turbulent entrainment for steam
 *                         and fumes.
 *
 * State persists between frames in a keyed registry: the same beaker keeps
 * its ripples from one animation frame to the next, and switching
 * experiments prunes what is no longer on screen. Nothing here draws, and
 * nothing here imports the DOM.
 */

import { dt, clock, clamp, lerp, fbm, noise1 } from './renderers/realism.js';

/* ------------------------------------------------------------------ *
 *  Persistent state registry
 * ------------------------------------------------------------------ */

const REG = new Map();

/**
 * Fetch (or lazily create) the persistent simulation state for a piece of
 * apparatus. Anything not touched for a while is dropped, so leaving an
 * experiment does not leave its ripples running forever.
 */
export function stateFor(key, factory) {
  let rec = REG.get(key);
  if (!rec) { rec = { obj: factory(), seen: 0 }; REG.set(key, rec); }
  rec.seen = clock();
  return rec.obj;
}

/** Drop state for apparatus that has not been drawn for `maxAge` seconds. */
export function prune(maxAge = 6) {
  const now = clock();
  for (const [k, rec] of REG) if (now - rec.seen > maxAge) REG.delete(k);
}

/** Forget everything — called when a different experiment is opened. */
export function resetFluids() { REG.clear(); }

/* ------------------------------------------------------------------ *
 *  Free surface: the 1-D wave equation
 * ------------------------------------------------------------------ */

/**
 * Explicit finite-difference solver for a shallow free surface.
 *
 * The Courant number c·Δt/Δx must stay below 1 or the scheme blows up, so
 * the wave speed is expressed as a Courant number directly and the step is
 * sub-cycled when a frame runs long. Boundaries are reflecting — the walls
 * of the vessel — which is what produces the standing-wave sloshing you see
 * when a beaker is nudged.
 */
export class WaveField {
  constructor(n = 40, opts = {}) {
    this.n = n;
    this.cur = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.next = new Float32Array(n);
    this.courant = opts.courant ?? 0.42;   // c·Δt/Δx, stable below 1
    this.damping = opts.damping ?? 4.2;    // γ, viscous loss (s⁻¹) — a nudged beaker settles in a couple of seconds
    this.maxAmp = opts.maxAmp ?? 7;        // px, clipped so it cannot explode
  }

  /**
   * The vessel holds a fixed volume of liquid, so any displacement at one
   * point must be balanced elsewhere: pushing the surface down here raises
   * it there. Enforcing that explicitly is not cosmetic — without it a
   * disturbance leaves a net offset which, having no velocity, the viscous
   * term can never remove, and the surface settles permanently off-level.
   */
  conserveVolume() {
    let m = 0;
    for (let i = 0; i < this.n; i++) m += this.cur[i];
    m /= this.n;
    if (m === 0) return;
    for (let i = 0; i < this.n; i++) this.cur[i] -= m;
  }

  /** Disturb the surface at fraction f∈[0,1] across the vessel. */
  disturb(f, amp, width = 2) {
    const i0 = clamp(Math.round(f * (this.n - 1)), 0, this.n - 1);
    for (let d = -width; d <= width; d++) {
      const i = i0 + d;
      if (i < 0 || i >= this.n) continue;
      const fall = Math.cos((d / (width + 1)) * Math.PI * 0.5);
      this.cur[i] -= amp * fall * fall;
    }
    this.conserveVolume();
  }

  /** Continuous forcing — a stirrer, a shaken flask, boiling agitation. */
  agitate(strength) {
    if (strength <= 0) return;
    const t = clock();
    for (let i = 0; i < this.n; i++) {
      this.cur[i] += (noise1(t * 7 + i * 0.7) - 0.5) * strength;
    }
    this.conserveVolume();
  }

  step(deltaT = dt()) {
    // Sub-cycle so a long frame cannot break the Courant condition.
    const steps = Math.min(4, Math.max(1, Math.ceil(deltaT / 0.018)));
    const h = deltaT / steps;
    const c2 = this.courant * this.courant;
    for (let s = 0; s < steps; s++) {
      const { cur, prev, next, n } = this;
      for (let i = 0; i < n; i++) {
        const l = cur[i > 0 ? i - 1 : 1];              // reflecting wall
        const r = cur[i < n - 1 ? i + 1 : n - 2];
        const lap = l - 2 * cur[i] + r;
        let v = 2 * cur[i] - prev[i] + c2 * lap;
        v -= this.damping * h * (cur[i] - prev[i]);
        next[i] = clamp(v, -this.maxAmp, this.maxAmp);
      }
      this.prev = this.cur; this.cur = this.next; this.next = prev;
      this.conserveVolume();
    }
    return this;
  }

  /** Surface displacement in px at fraction f across the vessel. */
  at(f) {
    const x = clamp(f, 0, 1) * (this.n - 1);
    const i = Math.floor(x);
    const j = Math.min(this.n - 1, i + 1);
    return lerp(this.cur[i], this.cur[j], x - i);
  }

  /** Peak displacement — used to modulate the surface sheen. */
  amplitude() {
    let m = 0;
    for (let i = 0; i < this.n; i++) { const a = Math.abs(this.cur[i]); if (a > m) m = a; }
    return m;
  }
}

/* ------------------------------------------------------------------ *
 *  Falling drops
 * ------------------------------------------------------------------ */

const G_PX = 7600;   // px s⁻², calibrated so a ~5 cm fall takes ~0.11 s as it does on a real bench

/**
 * A stream of drops leaving a burette tip or a dropper.
 *
 * Real burette delivery is discrete: liquid gathers at the jet until surface
 * tension can no longer hold it (about 0.05 mL per drop for water from a
 * standard tip), then it falls. So the emitter converts a delivery RATE into
 * a drop INTERVAL, and each drop is integrated under gravity until it meets
 * the receiving surface, where it hands its momentum to the wave field.
 */
export class DropStream {
  constructor(opts = {}) {
    this.drops = [];
    this.splashes = [];
    this.pending = 0;
    this.dropVolume = opts.dropVolume ?? 0.05;  // mL per drop
    this.pendingGrowth = 0;                     // the hanging drop at the tip
  }

  /**
   * @param rateMlPerS delivery rate; 0 closes the stopcock
   * @param tipX, tipY the jet
   * @param targetY   surface the drops land on
   * @param onImpact  callback(fraction-of-nothing, speed) for coupling
   */
  update(rateMlPerS, tipX, tipY, targetY, onImpact) {
    const h = dt();
    // Accumulate delivered volume; every dropVolume worth releases one drop.
    if (rateMlPerS > 0) {
      this.pending += rateMlPerS * h;
      this.pendingGrowth = clamp(this.pending / this.dropVolume, 0, 1);
      while (this.pending >= this.dropVolume) {
        this.pending -= this.dropVolume;
        this.drops.push({ x: tipX, y: tipY, v: 0 });
      }
    } else {
      this.pendingGrowth *= Math.max(0, 1 - h * 6);
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.v += G_PX * h;
      d.y += d.v * h;
      if (d.y >= targetY) {
        this.drops.splice(i, 1);
        const speed = d.v;
        // Splash: a few secondary droplets thrown up, energy from the impact.
        const nSplash = clamp(Math.round(speed / 260), 1, 5);
        for (let s = 0; s < nSplash; s++) {
          this.splashes.push({
            x: d.x, y: targetY,
            vx: (Math.random() - 0.5) * speed * 0.16,
            vy: -Math.random() * speed * 0.2 - 20,
            life: 1,
          });
        }
        if (onImpact) onImpact(speed);
      }
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.vy += G_PX * h;
      s.x += s.vx * h;
      s.y += s.vy * h;
      s.life -= h * 3.2;
      if (s.life <= 0 || s.y > targetY + 2) this.splashes.splice(i, 1);
    }
    return this;
  }

  clear() { this.drops.length = 0; this.splashes.length = 0; this.pending = 0; this.pendingGrowth = 0; }
}

/* ------------------------------------------------------------------ *
 *  Rising bubbles
 * ------------------------------------------------------------------ */

/**
 * Bubbles rising through a liquid.
 *
 * In the creeping-flow regime a bubble's terminal speed follows from
 * balancing buoyancy against Stokes drag:  v_t = 2 r² Δρ g / (9 μ)  — so it
 * scales with the SQUARE of the radius. That is why the fine bubbles from a
 * gently boiling solution drift up lazily while the coarse ones from a
 * carbonate + acid reaction shoot to the surface. The lateral wobble is the
 * path instability real bubbles show above a modest Reynolds number.
 */
export class BubbleColumn {
  constructor(opts = {}) {
    this.bubbles = [];
    this.viscosity = opts.viscosity ?? 1;   // relative to water
    this.acc = 0;
  }

  /** rate = bubbles per second; they nucleate across the vessel floor. */
  update(rate, x0, x1, floorY, surfaceY, onBurst) {
    const h = dt();
    if (rate > 0) {
      this.acc += rate * h;
      while (this.acc >= 1) {
        this.acc -= 1;
        const r = 0.9 + Math.random() * 2.6;
        this.bubbles.push({
          x: lerp(x0 + 2, x1 - 2, Math.random()),
          y: floorY - r,
          r,
          seed: Math.random() * 100,
          v: 0,
        });
      }
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      // Stokes terminal velocity, reached almost instantly at this scale.
      const vT = (2 * b.r * b.r * 9.81 * 24) / (9 * this.viscosity);
      b.v = lerp(b.v, vT, clamp(h * 12, 0, 1));
      b.y -= b.v * h;
      // Path instability: a lateral wobble that grows with radius.
      b.x += (noise1(clock() * 3.4 + b.seed) - 0.5) * b.r * 2.4 * h * 24;
      b.x = clamp(b.x, x0 + b.r, x1 - b.r);
      // Bubbles expand slightly as the head of liquid above them falls.
      b.r += b.r * 0.06 * h;
      if (b.y <= surfaceY + b.r) {
        this.bubbles.splice(i, 1);
        if (onBurst) onBurst(clamp((b.x - x0) / Math.max(1, x1 - x0), 0, 1), b.r);
      }
    }
    return this;
  }

  clear() { this.bubbles.length = 0; this.acc = 0; }
}

/* ------------------------------------------------------------------ *
 *  Settling precipitate
 * ------------------------------------------------------------------ */

/**
 * Solid particles falling out of solution. Same Stokes balance as a bubble
 * with the density difference reversed, so the settling rate is a genuine
 * read-out of particle size: a curdy AgCl precipitate drops in seconds, a
 * colloidal one stays suspended and is why it must be coagulated first.
 */
export class Precipitate {
  constructor(opts = {}) {
    this.parts = [];
    this.settled = 0;               // fraction that has reached the floor
    this.viscosity = opts.viscosity ?? 1;
  }

  /** amount ∈ [0,1] — how much solid the reaction has produced so far. */
  update(amount, x0, x1, topY, floorY, opts = {}) {
    const h = dt();
    const want = Math.round(clamp(amount, 0, 1) * (opts.max ?? 90));
    while (this.parts.length < want) {
      const r = 0.7 + Math.random() * (opts.coarse ? 2.2 : 0.9);
      this.parts.push({
        x: lerp(x0 + 3, x1 - 3, Math.random()),
        y: lerp(topY, floorY - 6, Math.random() * 0.35),
        r, rest: 0, seed: Math.random() * 60,
      });
    }
    while (this.parts.length > want) this.parts.pop();

    let atRest = 0;
    for (const p of this.parts) {
      const floor = floorY - p.rest;
      if (p.y < floor) {
        const vT = (2 * p.r * p.r * 9.81 * 22) / (9 * this.viscosity);
        p.y = Math.min(floor, p.y + vT * h);
        p.x += (noise1(clock() * 1.6 + p.seed) - 0.5) * h * 9;   // Brownian drift
        p.x = clamp(p.x, x0 + 2, x1 - 2);
      } else atRest++;
    }
    this.settled = this.parts.length ? atRest / this.parts.length : 0;
    return this;
  }

  clear() { this.parts.length = 0; this.settled = 0; }
}

/* ------------------------------------------------------------------ *
 *  Mixing — advection and diffusion of a dye
 * ------------------------------------------------------------------ */

/**
 * A 1-D concentration profile across a vessel, stepped with the
 * advection–diffusion equation  ∂c/∂t = D ∂²c/∂x² − u ∂c/∂x.
 *
 * When indicator is added at one point it does not tint the whole flask at
 * once: the colour spreads from where the drop fell, and how fast depends
 * on whether the student is swirling. Real titration behaviour — the
 * transient pink that fades on swirling near the end point — falls out of
 * this rather than being scripted.
 */
export class MixField {
  constructor(n = 32, opts = {}) {
    this.n = n;
    this.c = new Float32Array(n);
    this.tmp = new Float32Array(n);
    this.D = opts.D ?? 0.9;
  }

  /** Inject dye at fraction f across the vessel. */
  inject(f, amount, width = 3) {
    const i0 = clamp(Math.round(f * (this.n - 1)), 0, this.n - 1);
    for (let d = -width; d <= width; d++) {
      const i = i0 + d;
      if (i < 0 || i >= this.n) continue;
      this.c[i] = clamp(this.c[i] + amount * (1 - Math.abs(d) / (width + 1)), 0, 1);
    }
  }

  /** stir ∈ [0,1] — swirling the flask raises the effective diffusivity by orders of magnitude. */
  step(stir = 0, deltaT = dt()) {
    const D = this.D * (1 + stir * 60);
    const k = clamp(D * deltaT, 0, 0.48);        // explicit-diffusion stability limit
    const { c, tmp, n } = this;
    for (let i = 0; i < n; i++) {
      const l = c[i > 0 ? i - 1 : 0];
      const r = c[i < n - 1 ? i + 1 : n - 1];
      tmp[i] = c[i] + k * (l - 2 * c[i] + r);
    }
    this.c.set(tmp);
    return this;
  }

  at(f) {
    const x = clamp(f, 0, 1) * (this.n - 1);
    const i = Math.floor(x);
    return lerp(this.c[i], this.c[Math.min(this.n - 1, i + 1)], x - i);
  }

  /** Volume-average concentration — what the bulk colour should be. */
  mean() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.c[i];
    return s / this.n;
  }

  /** How unevenly mixed it is; 0 once fully homogeneous. */
  spread() {
    const m = this.mean();
    let v = 0;
    for (let i = 0; i < this.n; i++) v += (this.c[i] - m) ** 2;
    return Math.sqrt(v / this.n);
  }

  fill(v) { this.c.fill(clamp(v, 0, 1)); return this; }
  clear() { this.c.fill(0); return this; }
}

/* ------------------------------------------------------------------ *
 *  Buoyant plumes — steam, fumes, smoke
 * ------------------------------------------------------------------ */

/**
 * A rising plume. Puffs are buoyant, so they accelerate upward while
 * entraining surrounding air, which both slows them and makes them expand;
 * the lateral drift is turbulent, taken from layered noise so the plume
 * meanders instead of marching.
 */
export class Plume {
  constructor(opts = {}) {
    this.puffs = [];
    this.acc = 0;
    this.buoyancy = opts.buoyancy ?? 46;   // px s⁻²
    this.entrain = opts.entrain ?? 10;     // px s⁻¹ radial growth
  }

  update(rate, x, y, opts = {}) {
    const h = dt();
    const spread = opts.spread ?? 3;
    if (rate > 0) {
      this.acc += rate * h;
      while (this.acc >= 1) {
        this.acc -= 1;
        this.puffs.push({
          x: x + (Math.random() - 0.5) * spread * 2,
          y, r: 2 + Math.random() * 3,
          v: -12 - Math.random() * 10,
          life: 1, seed: Math.random() * 90,
        });
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.v -= this.buoyancy * h;                     // buoyant acceleration
      p.v *= 1 - clamp(h * 0.9, 0, 0.5);            // entrainment drag
      p.y += p.v * h;
      p.x += (fbm(clock() * 1.5 + p.seed) - 0.5) * 34 * h;
      p.r += this.entrain * h;
      p.life -= h * (opts.fade ?? 0.55);
      if (p.life <= 0) this.puffs.splice(i, 1);
    }
    return this;
  }

  clear() { this.puffs.length = 0; this.acc = 0; }
}

/* ------------------------------------------------------------------ *
 *  Convenience: the whole fluid state of one vessel
 * ------------------------------------------------------------------ */

/**
 * Everything a vessel needs, created once and kept alive between frames.
 * A renderer asks for `vessel('beaker')` and gets the same ripples,
 * bubbles and mixing it had last frame.
 */
export function vessel(key, opts = {}) {
  return stateFor(`vessel:${key}`, () => ({
    wave: new WaveField(opts.nodes ?? 40, opts),
    mix: new MixField(opts.mixNodes ?? 32, opts),
    bubbles: new BubbleColumn(opts),
    precip: new Precipitate(opts),
    plume: new Plume(opts),
    drops: new DropStream(opts),
    lastLevel: null,
  }));
}

/**
 * Couple a change in liquid level to the surface: pouring in, or a level
 * that jumps because the student moved a slider, should visibly disturb the
 * surface rather than teleporting it.
 */
export function levelChanged(v, level) {
  if (v.lastLevel === null) { v.lastLevel = level; return 0; }
  const d = level - v.lastLevel;
  v.lastLevel = level;
  if (Math.abs(d) > 0.4) v.wave.disturb(0.5, clamp(-d * 0.35, -4, 4), 6);
  return d;
}
