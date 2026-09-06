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
  float v = 0.0, a = 0.55;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
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
  colorA?: string;
  colorB?: string;
  colorC?: string;
  base?: string;
  intensity?: number;
  grain?: number;
  /** Multiplies the drift speed. 0 renders one still frame. */
  speed?: number;
  className?: string;
}

export function AuroraField({
  colorA = '#2b7bff',
  colorB = '#12d6b8',
  colorC = '#8a5cff',
  base = '#05060d',
  intensity = 1,
  grain = 0.016,
  speed = 1,
  className,
}: AuroraFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const uniforms = useRef({ colorA, colorB, colorC, base, intensity, grain, speed });
  uniforms.current = { colorA, colorB, colorC, base, intensity, grain, speed };

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
    let width = 0;
    let height = 0;
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
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
    const started = performance.now();
    const FRAME_MS = 1000 / 30;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!running) return;
      if (now - last < FRAME_MS) return;
      last = now;
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

      if (reduced) running = false;   // one frame is enough
    };
    raf = requestAnimationFrame(draw);

    const onVisibility = () => { running = document.visibilityState === 'visible' && !reduced; if (running) last = 0; };
    document.addEventListener('visibilitychange', onVisibility);
    if (!reduced) {
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('pointerleave', onLeave, { passive: true });
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
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
