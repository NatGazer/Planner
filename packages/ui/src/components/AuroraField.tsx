import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../anim/hooks';

/**
 * The living background.
 *
 * A single full-screen triangle rendered through one fragment shader: three
 * slow-drifting colour fields folded together, plus a soft pool of light that
 * follows the pointer. It is deliberately cheap:
 *
 *   • rendered into a buffer at ~45% of CSS pixels and stretched back up, so
 *     the fill cost is a fifth of a native-resolution pass;
 *   • capped at 30fps — the motion is slow enough that nobody can tell, and it
 *     leaves the whole frame budget to the interface on top;
 *   • paused entirely when the tab is hidden or the element scrolls away;
 *   • a single still frame when the reader prefers reduced motion;
 *   • falls back to a plain CSS gradient if WebGL is unavailable.
 *
 * Nothing above it ever repaints because of this canvas: it is a fixed,
 * composited layer behind the whole app.
 */

const VERT = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  // One oversized triangle covers the viewport with no vertex buffer at all.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform vec2  uPointer;
uniform float uPointerEnergy;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uColorC;
uniform vec3  uBase;
uniform float uIntensity;
uniform float uGrain;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                 dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                 dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  // Two octaves. At this softness the third octave is invisible and costs a
  // third of the per-pixel budget — the whole field is nine noise samples a
  // pixel with three, six with two.
  float v = noise(p) * 0.62;
  v += noise(p * 2.03) * 0.31;
  return v;
}

void main() {
  vec2 st = uv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vec2((st.x - 0.5) * aspect, st.y - 0.5);

  float t = uTime * 0.045;

  // Three slow fields, each drifting on its own vector.
  float f1 = fbm(p * 1.35 + vec2(t * 1.10, -t * 0.62));
  float f2 = fbm(p * 2.10 + vec2(-t * 0.74, t * 0.93) + f1 * 0.55);
  float f3 = fbm(p * 0.85 + vec2(t * 0.40, t * 0.31) - f2 * 0.35);

  float m1 = smoothstep(-0.28, 0.55, f1 + f3 * 0.35);
  float m2 = smoothstep(-0.20, 0.60, f2 - f1 * 0.25);
  float m3 = smoothstep(-0.35, 0.48, f3 + f2 * 0.20);

  vec3 col = uBase;
  col = mix(col, uColorA, m1 * 0.72);
  col = mix(col, uColorB, m2 * 0.58);
  col = mix(col, uColorC, m3 * 0.42);

  // A pool of light under the pointer, and a gentle top-down wash.
  vec2 ap = vec2((uPointer.x - 0.5) * aspect, uPointer.y - 0.5);
  float glow = exp(-dot(p - ap, p - ap) * 5.5) * uPointerEnergy;
  col += (uColorA * 0.5 + uColorB * 0.5) * glow * 0.42;
  col *= 1.0 - 0.30 * smoothstep(0.15, 1.05, length(p * vec2(0.82, 1.0)));
  col = mix(uBase, col, uIntensity);

  // Hard luminance clamp. The field is atmosphere: it is never permitted to
  // drift more than 5% away from the base tone, so nothing it does can move
  // the contrast of the interface sitting on top of it.
  float bl = dot(uBase, vec3(0.2126, 0.7152, 0.0722));
  float cl = dot(col,   vec3(0.2126, 0.7152, 0.0722));
  col *= clamp(bl + clamp(cl - bl, -0.05, 0.05), 0.001, 2.0) / max(cl, 0.001);

  // Dithering: without it, wide flat gradients band badly on 8-bit displays.
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  fragColor = vec4(col, 1.0);
}`;

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export interface AuroraFieldProps {
  /**
   * Re-read the palette from CSS when this changes. Pass the resolved theme so
   * the field follows a light/dark switch without a second source of truth for
   * the colours — they live in tokens.css like everything else.
   */
  themeKey?: string;
  grain?: number;
  /** Multiplies the drift speed. 0 renders one still frame. */
  speed?: number;
  className?: string;
}

/** Resolve the aurora tokens from the document, with sane fallbacks. */
function readPalette() {
  const fallback = { colorA: '#2452c8', colorB: '#0e9e92', colorC: '#6741cc', base: '#04060c', intensity: 0.5 };
  if (typeof window === 'undefined') return fallback;
  const cs = getComputedStyle(document.documentElement);
  const pick = (name: string, or_: string) => (cs.getPropertyValue(name).trim() || or_);
  return {
    colorA: pick('--aurora-a', fallback.colorA),
    colorB: pick('--aurora-b', fallback.colorB),
    colorC: pick('--aurora-c', fallback.colorC),
    base: pick('--aurora-base', fallback.base),
    intensity: Number(pick('--aurora-intensity', String(fallback.intensity))) || fallback.intensity,
  };
}

export function AuroraField({ themeKey = 'dark', grain = 0.014, speed = 1, className }: AuroraFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const uniforms = useRef({ ...readPalette(), grain, speed });

  useEffect(() => {
    const sync = () => { uniforms.current = { ...readPalette(), grain, speed }; };
    sync();
    // Watch the attribute itself rather than trusting render order: whatever
    // flips the theme, the field follows it.
    const watcher = new MutationObserver(sync);
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watcher.disconnect();
  }, [themeKey, grain, speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power', preserveDrawingBuffer: false,
    });
    if (!gl) { canvas.dataset.fallback = 'true'; return undefined; }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        // eslint-disable-next-line no-console
        console.warn('aurora shader:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { canvas.dataset.fallback = 'true'; return undefined; }

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { canvas.dataset.fallback = 'true'; return undefined; }
    gl.useProgram(program);

    const loc = (n: string) => gl.getUniformLocation(program, n);
    const uResolution = loc('uResolution');
    const uTime = loc('uTime');
    const uPointer = loc('uPointer');
    const uPointerEnergy = loc('uPointerEnergy');
    const uColorA = loc('uColorA');
    const uColorB = loc('uColorB');
    const uColorC = loc('uColorC');
    const uBase = loc('uBase');
    const uIntensity = loc('uIntensity');
    const uGrain = loc('uGrain');

    const SCALE = 0.45;
    const MAX_PIXELS = 620_000;          // ~1050x590 — plenty for a soft field
    let width = 0;
    let height = 0;
    const resize = () => {
      const cw = Math.max(1, canvas.clientWidth);
      const ch = Math.max(1, canvas.clientHeight);
      let scale = SCALE;
      const area = cw * ch * SCALE * SCALE;
      if (area > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / area);
      const w = Math.max(1, Math.round(cw * scale));
      const h = Math.max(1, Math.round(ch * scale));
      if (w === width && h === height) return;
      width = w; height = h;
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    };

    const pointer = { x: 0.5, y: 0.42, energy: 0 };
    const target = { x: 0.5, y: 0.42, energy: 0 };
    const onPointer = (e: PointerEvent) => {
      target.x = e.clientX / window.innerWidth;
      target.y = 1 - e.clientY / window.innerHeight;
      target.energy = 1;
    };
    const onLeave = () => { target.energy = 0; };

    let raf = 0;
    let running = true;
    let last = 0;
    let still = false;

    /** Ask a still field for one more frame. */
    const redrawOnce = () => { if (still) { running = true; last = 0; } };
    const started = performance.now();
    const FRAME_MS = 1000 / 30;

    // Frame-cost guard. The field is atmosphere; if the machine cannot afford
    // it, it gives up its place rather than costing the interface frames.
    let slowFrames = 0;
    let drawn = 0;
    const standDown = () => {
      running = false;
      cancelAnimationFrame(raf);
      canvas.dataset.fallback = 'true';   // the CSS gradient takes over
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!running) return;
      const sinceLast = now - last;
      if (sinceLast < FRAME_MS) return;
      last = now;

      // Give the first second to settle — first paint is always the worst.
      if (drawn > 30) {
        if (sinceLast > FRAME_MS * 2.2) slowFrames += 1; else slowFrames = Math.max(0, slowFrames - 1);
        if (slowFrames > 24) { standDown(); return; }
      }
      drawn += 1;
      resize();

      const u = uniforms.current;
      pointer.x += (target.x - pointer.x) * 0.06;
      pointer.y += (target.y - pointer.y) * 0.06;
      pointer.energy += (target.energy - pointer.energy) * 0.05;

      gl.uniform2f(uResolution, width, height);
      gl.uniform1f(uTime, reduced ? 120 : ((now - started) / 1000) * u.speed);
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.uniform1f(uPointerEnergy, reduced ? 0 : pointer.energy);
      gl.uniform3fv(uColorA, hexToRgb(u.colorA));
      gl.uniform3fv(uColorB, hexToRgb(u.colorB));
      gl.uniform3fv(uColorC, hexToRgb(u.colorC));
      gl.uniform3fv(uBase, hexToRgb(u.base));
      gl.uniform1f(uIntensity, u.intensity);
      gl.uniform1f(uGrain, u.grain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // A still field is drawn once — which means anything that can discard
      // what it drew has to be able to ask for it again.
      if (reduced || u.speed === 0) {
        still = true;
        running = false;
      }
    };
    raf = requestAnimationFrame(draw);

    // Anything that means nobody is looking at the field stops it dead: the
    // tab is hidden, a sheet is covering it, or the browser dropped the GPU
    // context out from under us.
    let onScreen = true;
    const shouldRun = () =>
      document.visibilityState === 'visible'
      && onScreen
      && document.documentElement.dataset.overlay !== '1'
      && !reduced;
    const onVisibility = () => {
      // Coming back into view repaints a still field: a backing store can be
      // discarded while a tab is hidden, and a canvas that never redraws would
      // come back blank.
      if (still) { if (document.visibilityState === 'visible' && onScreen) redrawOnce(); return; }
      running = shouldRun();
      if (running) last = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const overlayWatcher = new MutationObserver(onVisibility);
    overlayWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-overlay'] });

    // A palette change repaints even a still field.
    const paletteWatcher = new MutationObserver(() => {
      if (still) redrawOnce(); else { running = shouldRun(); last = 0; }
    });
    paletteWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      onVisibility();
    });
    io.observe(canvas);

    // A restored context has an empty backing store; a resize invalidates it.
    const onRestored = () => { canvas.dataset.fallback = ''; still = false; running = true; last = 0; };
    canvas.addEventListener('webglcontextrestored', onRestored);

    const onLost = (e: Event) => {
      e.preventDefault();
      running = false;
      cancelAnimationFrame(raf);
      canvas.dataset.fallback = 'true';
    };
    canvas.addEventListener('webglcontextlost', onLost);
    if (!reduced) {
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('pointerleave', onLeave, { passive: true });
    }
    const ro = new ResizeObserver(() => { resize(); redrawOnce(); });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      overlayWatcher.disconnect();
      paletteWatcher.disconnect();
      io.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerleave', onLeave);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [reduced]);

  return <canvas ref={canvasRef} className={className ?? 'aurora-field'} aria-hidden="true" />;
}
