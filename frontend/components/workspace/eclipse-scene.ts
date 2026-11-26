/** The camera rays intersect an occulting sphere, a backlit emitter and two dust planes.
 * The single triangle needs no textures, vertex buffers or external artwork. */
const vertex = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform vec2 pointer;
uniform float phase;
uniform float detail;
out vec4 outputColor;

float dust(vec2 p) {
  vec2 cell = floor(p);
  float seed = fract(sin(dot(cell, vec2(41.7, 289.1))) * 4375.5);
  vec2 pos = vec2(seed, fract(seed * 37.4)) * .72 + .14;
  return step(.79, seed) * (1.0 - smoothstep(.006, .035, length(fract(p) - pos)));
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - resolution) / resolution.y;
  float orbit = smoothstep(0.0, .84, phase);
  vec3 eye = vec3(.15 * (1.0 - orbit) + pointer.x * .10, pointer.y * .06, 3.95 - .36 * orbit);
  vec3 ray = normalize(vec3(uv * .84 - eye.xy * .22, -1.72));
  vec3 center = vec3(mix(-.42, .012, orbit), .01, 0.0);
  vec3 toMoon = center - eye;
  float along = dot(toMoon, ray);
  float dist2 = dot(toMoon, toMoon) - along * along;
  float radius = .93;
  float edge = sqrt(max(0.0, dist2)) - radius;
  float aa = max(fwidth(edge), .001);
  float surface = 1.0 - smoothstep(-aa, aa, edge);
  float hit = along - sqrt(max(0.0, radius * radius - dist2));
  vec3 normal = normalize(eye + ray * hit - center);
  vec3 sun = vec3(.10, .04, -.98);
  vec3 sunOffset = sun - eye;
  float sunDist = length(cross(sunOffset, ray));
  float sunEdge = sunDist - 1.21;
  float angle = atan(ray.y, ray.x);
  float stream = .73 + .14 * sin(angle * 9.0 + phase * .65) + .10 * cos(angle * 15.0);
  vec3 silver = vec3(.75, .89, .96);
  vec3 teal = vec3(.13, .55, .57);
  vec3 color = mix(teal, silver, .34 + .27 * sin(angle + .8)) *
    (exp(-max(0.0, sunEdge) * 13.0) * .76 + exp(-abs(sunEdge) * 3.2) * .27 * stream);
  color += silver * (1.0 - smoothstep(-.012, .012, sunEdge)) * .32;
  vec2 farPlane = (eye + ray * ((-5.0 - eye.z) / ray.z)).xy;
  vec2 nearPlane = (eye + ray * ((-2.0 - eye.z) / ray.z)).xy;
  color += silver * (dust(farPlane * 4.5) * .35 + detail * dust(nearPlane * 2.8) * .45);
  float rim = pow(1.0 - max(0.0, dot(normal, -ray)), 4.0);
  vec3 nearSide = vec3(.018, .028, .038) + (.018 + .12 * rim) * teal
    + rim * silver * max(0.0, dot(normal, normalize(vec3(.75, .5, -.28))));
  color = mix(color, nearSide, surface);
  float aperture = smoothstep(-.03, .22, phase);
  float vignette = 1.0 - smoothstep(.70, 1.0, length(uv));
  outputColor = vec4(color, aperture * vignette);
}`;

export function startEclipse(canvas: HTMLCanvasElement, elapsed: () => number, finish: () => void) {
  const gl = canvas.getContext("webgl2", {
    alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false,
    powerPreference: "low-power", preserveDrawingBuffer: false,
  });
  if (!gl) { finish(); return () => {}; }
  const program = gl.createProgram();
  const shaders: WebGLShader[] = [];
  let frame = 0;
  let disposed = false;
  const pointer = { x: 0, y: 0 };
  const move = (event: PointerEvent) => {
    pointer.x = 2 * event.clientX / window.innerWidth - 1;
    pointer.y = 1 - 2 * event.clientY / window.innerHeight;
  };
  const lost = (event: Event) => { event.preventDefault(); finish(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    canvas.removeEventListener("webglcontextlost", lost);
    window.removeEventListener("pointermove", move);
    gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  try {
    if (!program) throw new Error("WebGL program unavailable");
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("WebGL shader unavailable");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Eclipse program could not link");
    gl.useProgram(program);
    const resolution = gl.getUniformLocation(program, "resolution");
    const phase = gl.getUniformLocation(program, "phase");
    const pointerLocation = gl.getUniformLocation(program, "pointer");
    const detail = gl.getUniformLocation(program, "detail");
    let density = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2);
    let last = 0;
    const samples: number[] = [];
    let reduced = false;
    const draw = (now: number) => {
      if (disposed) return;
      const progress = elapsed();
      if (progress >= 1 || document.hidden || gl.isContextLost()) { finish(); return; }
      if (last) samples.push(now - last);
      last = now;
      if (samples.length === 20) {
        const median = samples.sort((a, b) => a - b)[10];
        samples.length = 0;
        if (median > 40) { finish(); return; }
        if (median > 24) { reduced = true; density = 1; }
      }
      const width = Math.max(1, Math.round(canvas.clientWidth * density));
      const height = Math.max(1, Math.round(canvas.clientHeight * density));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(resolution, width, height);
      gl.uniform2f(pointerLocation, pointer.x, pointer.y);
      gl.uniform1f(phase, progress);
      gl.uniform1f(detail, reduced ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(draw);
    };
    canvas.addEventListener("webglcontextlost", lost);
    window.addEventListener("pointermove", move, { passive: true });
    draw(performance.now());
  } catch {
    dispose();
    finish();
  }
  return dispose;
}
