"use client";
import { useEffect, useRef, useState } from "react";
import {
  GLOBE_CAMERA_FAR,
  GLOBE_CAMERA_NEAR,
  GLOBE_ZOOM_MAX,
  GLOBE_ZOOM_MIN,
  clampGlobeZoom,
  clusterVenues,
  globeCameraParams,
  greatCircle,
  projectPerspective,
  rotateToView,
  solarDirection,
  unprojectScreenToLatLon,
  xyz,
} from "../../../backend/services/market-data/globe";
import type { Exchange } from "../../../backend/services/market-data/exchanges";
import type { GeographicFocus } from "./globe-projection";

export type GlobePointMarker = {
  id: string;
  lat: number;
  lon: number;
  kind: "EARTHQUAKE" | "DISASTER" | "COUNTRY" | "CONFLICT";
  label?: string;
};

export type FocusCoords = {
  lat: number;
  lon: number;
  zoom?: number;
  nonce: number;
};

type Props = {
  venues: Exchange[];
  selected: Exchange | null;
  autoRotate: boolean;
  onPause: () => void;
  onSelect: (venue: Exchange) => void;
  onZoom: (zoom: number, focus?: GeographicFocus | null) => void;
  cameraRef?: React.RefObject<(() => GeographicFocus | null) | null>;
  zoom: number;
  forceFallback?: boolean;
  motionOverride?: boolean;
  resetToken?: number;
  onFallbackChange?: (fallback: boolean) => void;
  focusCoords?: FocusCoords | null;
  hazardPoints?: GlobePointMarker[];
  countryPoints?: GlobePointMarker[];
  conflictPoints?: GlobePointMarker[];
  selectedMarkerId?: string | null;
  onSelectMarker?: (marker: GlobePointMarker) => void;
  showExchanges?: boolean;
  showArcs?: boolean;
  earthQuality?: "auto" | "balanced" | "reduced";
};

const vertex = `
attribute vec3 aPosition;
uniform vec2 uRotation;
uniform float uCameraDist;
uniform float uFocalEff;
uniform float uAspect;
uniform float uNear;
uniform float uFar;
uniform float uPointSize;
varying vec3 vPosition;
varying vec3 vWorld;
void main() {
  float c = cos(uRotation.x), s = sin(uRotation.x);
  float p = cos(uRotation.y), q = sin(uRotation.y);
  vec3 a = vec3(c * aPosition.x + s * aPosition.z, aPosition.y, -s * aPosition.x + c * aPosition.z);
  vWorld = aPosition;
  vPosition = vec3(a.x, p * a.y - q * a.z, q * a.y + p * a.z);
  float camDepth = max(uNear, uCameraDist - vPosition.z);
  float zClip = ((uFar + uNear) / (uFar - uNear)) * camDepth - (2.0 * uFar * uNear) / (uFar - uNear);
  gl_Position = vec4(
    (vPosition.x * uFocalEff) / uAspect,
    vPosition.y * uFocalEff,
    zClip,
    camDepth
  );
  gl_PointSize = uPointSize;
}
`;

const fragment = `
precision mediump float;
varying vec3 vPosition;
varying vec3 vWorld;
uniform vec4 uColor;
uniform float uMode;
uniform float uHorizonZ;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uCloud;
uniform float uTextureReady;
uniform float uCloudReady;
uniform vec3 uSunDir;
uniform vec3 uSunView;

void main() {
  if (uMode < 0.5) {
    vec3 n = normalize(vPosition);
    vec3 w = normalize(vWorld);
    vec2 uv = vec2(
      atan(w.x, w.z) / 6.28318530718 + 0.5,
      asin(clamp(w.y, -1.0, 1.0)) / 3.14159265359 + 0.5
    );

    vec3 sunW = normalize(uSunDir);
    vec3 sunV = normalize(uSunView);
    float sunDot = dot(w, sunW);
    float diffuse = max(0.0, sunDot);
    float dayFactor = smoothstep(-0.14, 0.22, sunDot);
    float twilight = exp(-pow((sunDot + 0.02) * 5.0, 2.0));

    // Natural full-color NASA Blue Marble in linear light space
    vec3 daySrgb = texture2D(uDay, uv).rgb;
    vec3 dayLin = pow(max(daySrgb, vec3(0.001)), vec3(2.2));
    float luma = dot(dayLin, vec3(0.2126, 0.7152, 0.0722));
    vec3 naturalDay = mix(vec3(luma), dayLin, 1.16);

    // Water mask derived from Blue Marble blue dominance over land channels
    float oceanMask = smoothstep(0.015, 0.13, daySrgb.b - max(daySrgb.r, daySrgb.g) * 0.96)
      * (1.0 - smoothstep(0.60, 0.82, daySrgb.r));

    // Restrained Blinn-Phong ocean specular glint aligned with solar direction
    vec3 halfVec = normalize(sunV + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(0.0, dot(n, halfVec)), 36.0) * oceanMask * smoothstep(0.0, 0.28, sunDot) * 0.28;

    float viewFill = 0.06 + 0.08 * max(0.0, n.z);
    vec3 dayLit = naturalDay * (viewFill + 1.12 * diffuse)
      + vec3(0.22, 0.32, 0.44) * spec
      + vec3(0.24, 0.10, 0.035) * twilight * (0.35 + 0.65 * naturalDay.r);

    // Night hemisphere: deep navy-charcoal earth silhouette + warm golden NASA Black Marble city lights
    vec3 nightBase = naturalDay * vec3(0.065, 0.088, 0.145) + vec3(0.004, 0.007, 0.014);
    float nightTex = texture2D(uNight, uv).r;
    float nightMask = 1.0 - smoothstep(-0.18, 0.14, sunDot);
    float cityStrength = pow(max(0.0, nightTex - 0.042), 1.12) * nightMask;
    vec3 cityLights = vec3(1.0, 0.78, 0.42) * cityStrength * 1.55;

    // Historical translucent cloud layer
    float cloudSample = texture2D(uCloud, uv).r * uCloudReady;
    float cloudAlpha = clamp(pow(cloudSample, 1.48) * 0.56, 0.0, 0.66);
    vec3 cloudDay = vec3(0.92, 0.95, 1.0) * (0.09 + 0.96 * diffuse)
      + vec3(0.26, 0.12, 0.05) * twilight * 0.55;
    vec3 cloudNight = vec3(0.045, 0.062, 0.10);
    vec3 cloudColor = mix(cloudNight, cloudDay, dayFactor);

    vec3 surface = mix(nightBase, dayLit, dayFactor) + cityLights * (1.0 - cloudAlpha * 0.42);
    surface = mix(surface, cloudColor, cloudAlpha);

    // Thin restrained Rayleigh blue atmospheric Fresnel rim
    float fresnel = pow(1.0 - max(0.0, n.z), 3.4);
    vec3 atmoColor = mix(vec3(0.07, 0.16, 0.34), vec3(0.26, 0.58, 1.0), clamp(sunDot * 0.72 + 0.55, 0.0, 1.0));
    vec3 litEarth = surface + atmoColor * fresnel * 0.46;

    vec3 placeholder = vec3(0.025, 0.065, 0.14) * (0.30 + 0.70 * diffuse) + atmoColor * fresnel * 0.36;
    vec3 finalLin = mix(placeholder, litEarth, uTextureReady);

    // Photographic soft tone-mapping + sRGB gamma encoding
    vec3 mapped = (finalLin / (finalLin + vec3(0.86))) * 1.40;
    vec3 srgb = pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.2));
    gl_FragColor = vec4(srgb, 1.0);
  } else if (uMode > 1.5) {
    if (vPosition.z < uHorizonZ) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5 || (uMode > 2.5 && d < 0.30)) discard;
    float edge = uMode > 2.5
      ? smoothstep(0.30, 0.35, d) * (1.0 - smoothstep(0.43, 0.5, d))
      : 1.0 - smoothstep(0.36, 0.5, d);
    gl_FragColor = vec4(uColor.rgb, uColor.a * edge);
  } else {
    if (vPosition.z < uHorizonZ * 0.4) discard;
    gl_FragColor = uColor;
  }
}
`;

/**
 * Strategic Souls X5.3 — Enlarged, Multi-Level Perspective 3D Earth Renderer.
 * - True perspective camera zoom (1.0x to 5.0x) with zero near/far clipping and circular silhouette
 * - Smooth drag rotation with inertia, two-finger touch pinch zoom, double-tap/click zoom to point,
 *   keyboard arrows/+/-/0, and smooth fly-to target coordinates
 * - Renders verified 3D surface markers directly (24 exchanges, USGS earthquakes, NASA EONET, countries, conflicts)
 * - Lazy-initializes textures in viewport, pauses offscreen/background/reduced-motion, clean WebGL teardown
 */
export default function GlobeCanvas({
  venues,
  selected,
  autoRotate,
  onPause,
  onSelect,
  onZoom,
  cameraRef,
  zoom,
  forceFallback = false,
  motionOverride = false,
  resetToken = 0,
  onFallbackChange,
  focusCoords = null,
  hazardPoints = [],
  countryPoints = [],
  conflictPoints = [],
  selectedMarkerId = null,
  onSelectMarker,
  showExchanges = true,
  showArcs = true,
  earthQuality = "auto",
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    settings = useRef({
      venues,
      selected,
      autoRotate,
      motionOverride,
      resetToken,
      onPause,
      onSelect,
      onZoom,
      zoom: clampGlobeZoom(zoom),
      focusCoords,
      hazardPoints,
      countryPoints,
      conflictPoints,
      selectedMarkerId,
      onSelectMarker,
      showExchanges,
      showArcs,
      earthQuality,
    }),
    rotation = useRef(focusCoords ? {
      yaw: -focusCoords.lon * Math.PI / 180,
      pitch: Math.max(-1.32, Math.min(1.32, focusCoords.lat * Math.PI / 180)),
    } : { yaw: -1.36, pitch: 0.34 }),
    currentZoom = useRef(clampGlobeZoom(zoom)),
    [failure, setFailure] = useState(false),
    [satelliteStage, setSatelliteStage] = useState<
      "preparing" | "loading" | "ready" | "failed"
    >("preparing"),
    [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    onFallbackChange?.(forceFallback || failure);
  }, [forceFallback, failure, onFallbackChange]);

  useEffect(() => {
    if (!cameraRef) return;
    cameraRef.current = () => {
      const shape = canvas.current?.getBoundingClientRect();
      if (!shape?.width || !shape.height) return null;
      return unprojectScreenToLatLon(shape.width / 2, shape.height / 2,
        rotation.current.yaw, rotation.current.pitch, shape.width, shape.height, currentZoom.current);
    };
    return () => { cameraRef.current = null; };
  }, [cameraRef]);

  useEffect(() => {
    settings.current = {
      venues,
      selected,
      autoRotate,
      motionOverride,
      resetToken,
      onPause,
      onSelect,
      onZoom,
      zoom: clampGlobeZoom(zoom),
      focusCoords,
      hazardPoints,
      countryPoints,
      conflictPoints,
      selectedMarkerId,
      onSelectMarker,
      showExchanges,
      showArcs,
      earthQuality,
    };
  }, [
    venues,
    selected,
    autoRotate,
    motionOverride,
    resetToken,
    onPause,
    onSelect,
    onZoom,
    zoom,
    focusCoords,
    hazardPoints,
    countryPoints,
    conflictPoints,
    selectedMarkerId,
    onSelectMarker,
    showExchanges,
    showArcs,
    earthQuality,
  ]);

  useEffect(() => {
    const candidate = canvas.current;
    if (!candidate || forceFallback || failure) return;
    const el: HTMLCanvasElement = candidate;
    const gl = el.getContext("webgl", {
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      queueMicrotask(() => {
        setSatelliteStage("failed");
        setFailure(true);
      });
      return;
    }

    let stopped = false,
      frame = 0,
      visible = false,
      last = 0,
      dirty = true,
      hovering = false,
      resetSeen = -1,
      velYaw = 0,
      velPitch = 0,
      lastTapTime = 0,
      lastTapX = 0,
      lastTapY = 0,
      drag: {
        x: number;
        y: number;
        startX: number;
        startY: number;
        id: number;
      } | null = null,
      pinchDistance: number | null = null,
      selectedId = "",
      target: { yaw: number; pitch: number } | null = null;

    const activePointers = new Map<number, { x: number; y: number }>();
    const buffers = new Set<WebGLBuffer>(),
      shaders: WebGLShader[] = [],
      textures: WebGLTexture[] = [];

    const program = gl.createProgram();
    if (!program) {
      queueMicrotask(() => {
        setSatelliteStage("failed");
        setFailure(true);
      });
      return;
    }

    function shader(type: number, source: string) {
      const s = gl!.createShader(type);
      if (!s) throw new Error("Shader allocation failed");
      shaders.push(s);
      gl!.shaderSource(s, source);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS))
        throw new Error("Shader compilation failed");
      return s;
    }

    try {
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("WebGL link failed");
    } catch {
      shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      queueMicrotask(() => {
        setSatelliteStage("failed");
        setFailure(true);
      });
      return;
    }

    const position = gl.getAttribLocation(program, "aPosition"),
      uRotation = gl.getUniformLocation(program, "uRotation"),
      uCameraDist = gl.getUniformLocation(program, "uCameraDist"),
      uFocalEff = gl.getUniformLocation(program, "uFocalEff"),
      uAspect = gl.getUniformLocation(program, "uAspect"),
      uNear = gl.getUniformLocation(program, "uNear"),
      uFar = gl.getUniformLocation(program, "uFar"),
      uMode = gl.getUniformLocation(program, "uMode"),
      uHorizonZ = gl.getUniformLocation(program, "uHorizonZ"),
      uColor = gl.getUniformLocation(program, "uColor"),
      uPointSize = gl.getUniformLocation(program, "uPointSize"),
      uSunDir = gl.getUniformLocation(program, "uSunDir"),
      uSunView = gl.getUniformLocation(program, "uSunView");

    function buffer(vertices: number[]) {
      const b = gl!.createBuffer();
      if (!b) throw new Error("Buffer allocation failed");
      buffers.add(b);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
      gl!.bufferData(
        gl!.ARRAY_BUFFER,
        new Float32Array(vertices),
        gl!.STATIC_DRAW,
      );
      if (gl!.getError() !== gl!.NO_ERROR)
        throw new Error("Buffer allocation failed");
      return { b, count: vertices.length / 3 };
    }

    const connection = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
      deviceMemory?: number;
    };
    const constrained =
      window.matchMedia("(max-width:680px)").matches ||
      !!connection.connection?.saveData ||
      (connection.deviceMemory ?? 8) <= 2;
    const qualityBudget = settings.current.earthQuality;

    // 56x112 smooth sphere on desktop/standard, 40x80 on constrained mobile GPUs
    const latSteps = qualityBudget === "reduced" || constrained ? 40 : 56,
      lonSteps = qualityBudget === "reduced" || constrained ? 80 : 112,
      sphere: number[] = [];
    for (let a = 0; a < latSteps; a++)
      for (let b = 0; b < lonSteps; b++) {
        const p = (i: number, j: number) =>
          xyz({ lat: -90 + (i * 180) / latSteps, lon: (j * 360) / lonSteps });
        sphere.push(
          ...p(a, b),
          ...p(a + 1, b),
          ...p(a, b + 1),
          ...p(a, b + 1),
          ...p(a + 1, b),
          ...p(a + 1, b + 1),
        );
      }

    const releaseInitial = () => {
      textures.forEach((t) => gl.deleteTexture(t));
      buffers.forEach((b) => gl.deleteBuffer(b));
      shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      queueMicrotask(() => {
        setSatelliteStage("failed");
        setFailure(true);
      });
    };

    let sphereBuffer: ReturnType<typeof buffer>;
    try {
      sphereBuffer = buffer(sphere);
    } catch {
      releaseInitial();
      return;
    }

    const controller = new AbortController();
    let textureReady = false,
      cloudReady = false,
      textureStarted = false;
    const dayUniform = gl.getUniformLocation(program, "uDay"),
      nightUniform = gl.getUniformLocation(program, "uNight"),
      cloudUniform = gl.getUniformLocation(program, "uCloud"),
      readyUniform = gl.getUniformLocation(program, "uTextureReady"),
      cloudReadyUniform = gl.getUniformLocation(program, "uCloudReady");

    function makeTexture(unit: number, rgba: [number, number, number, number]) {
      const texture = gl!.createTexture();
      if (!texture) throw new Error("Texture allocation failed");
      textures.push(texture);
      gl!.activeTexture(gl!.TEXTURE0 + unit);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        1,
        1,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        new Uint8Array(rgba),
      );
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      return texture;
    }

    let dayTexture: WebGLTexture,
      nightTexture: WebGLTexture,
      cloudTexture: WebGLTexture;
    try {
      dayTexture = makeTexture(0, [20, 44, 78, 255]);
      nightTexture = makeTexture(1, [0, 0, 0, 255]);
      cloudTexture = makeTexture(2, [0, 0, 0, 255]);
    } catch {
      textures.forEach((t) => gl.deleteTexture(t));
      releaseInitial();
      return;
    }

    const textureWidth = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      qualityBudget === "reduced"
        ? 512
        : qualityBudget === "balanced" || constrained
          ? 1024
          : 2048,
    );

    const loadTexture = async (
      path: string,
      texture: WebGLTexture,
      unit: number,
    ) => {
      const timeoutCtrl = new AbortController();
      const timeoutId = window.setTimeout(() => timeoutCtrl.abort(), 15_000);
      const onParentAbort = () => timeoutCtrl.abort();
      controller.signal.addEventListener("abort", onParentAbort, { once: true });
      let response: Response;
      try {
        response = await fetch(path, {
          signal: timeoutCtrl.signal,
          cache: "force-cache",
        });
      } finally {
        window.clearTimeout(timeoutId);
        controller.signal.removeEventListener("abort", onParentAbort);
      }
      if (!response.ok) throw new Error("Satellite asset unavailable");
      const blob = await response.blob();
      if (blob.size > 2_500_000) throw new Error("Texture budget exceeded");
      let source: TexImageSource,
        close: () => void,
        bitmapFlipped = false;
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob, {
          resizeWidth: textureWidth,
          resizeHeight: textureWidth / 2,
          resizeQuality: "high",
          imageOrientation: "flipY",
        });
        source = bitmap;
        bitmapFlipped = true;
        close = () => bitmap.close();
      } else {
        const url = URL.createObjectURL(blob),
          image = new Image();
        image.src = url;
        await image.decode();
        source = image;
        close = () => URL.revokeObjectURL(url);
      }
      if (stopped) {
        close();
        return;
      }
      gl!.activeTexture(gl!.TEXTURE0 + unit);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, bitmapFlipped ? 0 : 1);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        source,
      );
      // Enable mipmapping for crisp power-of-two textures at all zoom levels
      if ((textureWidth & (textureWidth - 1)) === 0) {
        gl!.generateMipmap(gl!.TEXTURE_2D);
        gl!.texParameteri(
          gl!.TEXTURE_2D,
          gl!.TEXTURE_MIN_FILTER,
          gl!.LINEAR_MIPMAP_LINEAR,
        );
      }
      close();
      if (gl!.getError() !== gl!.NO_ERROR)
        throw new Error("Texture allocation failed");
      el.dataset.textureWidth = String(textureWidth);
      dirty = true;
      start();
    };

    function beginTextures() {
      if (textureStarted || stopped) return;
      textureStarted = true;
      setSatelliteStage("loading");
      loadTexture("/data/earth-day.jpg", dayTexture, 0)
        .then(() => {
          if (!stopped) {
            textureReady = true;
            setSatelliteStage("ready");
            el.dataset.satellite = "day-true-color";
            el.dataset.colorMode = "natural-rgb";
            start();
          }
        })
        .catch(() => {
          if (!stopped) {
            setSatelliteStage("failed");
            setFailure(true);
          }
        });
      loadTexture("/data/earth-night.jpg", nightTexture, 1)
        .then(() => {
          if (!stopped) {
            el.dataset.nightLights = "historical-2016";
            start();
          }
        })
        .catch(() => {
          el.dataset.nightLights = "unavailable";
        });
      if (!connection.connection?.saveData && qualityBudget !== "reduced")
        loadTexture("/data/earth-clouds.jpg", cloudTexture, 2)
          .then(() => {
            if (!stopped) {
              cloudReady = true;
              el.dataset.clouds = "historical-composite";
              start();
            }
          })
          .catch(() => {
            el.dataset.clouds = "unavailable";
          });
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isReducedMotion = () =>
      reduced.matches || document.documentElement.dataset.motion === "minimal";
    let frames = 0,
      lastIdleDraw = 0;
    let venueSignature = "",
      selectedBufferId = "",
      quakeSig = "",
      disasterSig = "",
      countrySig = "",
      conflictSig = "",
      selectedMarkerSig = "",
      focusNonceSeen = -1,
      pointBuffer: { b: WebGLBuffer; count: number } | null = null,
      selectedPointBuffer: { b: WebGLBuffer; count: number } | null = null,
      quakePointBuffer: { b: WebGLBuffer; count: number } | null = null,
      disasterPointBuffer: { b: WebGLBuffer; count: number } | null = null,
      countryPointBuffer: { b: WebGLBuffer; count: number } | null = null,
      conflictPointBuffer: { b: WebGLBuffer; count: number } | null = null,
      selectedMarkerBuffer: { b: WebGLBuffer; count: number } | null = null,
      arcBuffer: { b: WebGLBuffer; count: number } | null = null;

    function syncPointBuffer(
      current: { b: WebGLBuffer; count: number } | null,
      pts: readonly { lat: number; lon: number }[],
      radius: number,
    ) {
      if (current) {
        gl!.deleteBuffer(current.b);
        buffers.delete(current.b);
      }
      if (pts.length === 0) return null;
      return buffer(pts.flatMap((c) => xyz(c, radius)));
    }

    function aimAt(lat: number, lon: number) {
      let yaw = (-lon * Math.PI) / 180;
      while (yaw - rotation.current.yaw > Math.PI) yaw -= Math.PI * 2;
      while (yaw - rotation.current.yaw < -Math.PI) yaw += Math.PI * 2;
      target = {
        yaw,
        pitch: Math.max(-1.32, Math.min(1.32, (lat * Math.PI) / 180)),
      };
      velYaw = 0;
      velPitch = 0;
    }

    function drawBuffer(
      b: { b: WebGLBuffer; count: number },
      mode: number,
      color: number[],
      kind: number,
      size = 1,
    ) {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, b.b);
      gl!.vertexAttribPointer(position, 3, gl!.FLOAT, false, 0, 0);
      gl!.enableVertexAttribArray(position);
      gl!.uniform1f(uMode, mode);
      gl!.uniform4fv(uColor, color);
      gl!.uniform1f(uPointSize, size);
      gl!.drawArrays(kind, 0, b.count);
    }

    function draw(time: number) {
      frame = 0;
      if (stopped || !visible || document.hidden) return;
      const delta = last ? Math.min(100, time - last) : 0;
      last = time;
      const s = settings.current;

      if (s.focusCoords && s.focusCoords.nonce !== focusNonceSeen) {
        focusNonceSeen = s.focusCoords.nonce;
        aimAt(s.focusCoords.lat, s.focusCoords.lon);
      } else if (s.resetToken !== resetSeen) {
        resetSeen = s.resetToken;
        if (s.selected) {
          selectedId = s.selected.id;
          aimAt(s.selected.lat, s.selected.lon);
        } else {
          target = { yaw: -1.36, pitch: 0.34 };
        }
      } else if (s.selected && s.selected.id !== selectedId) {
        selectedId = s.selected.id;
        aimAt(s.selected.lat, s.selected.lon);
      }

      const reducedMotion = isReducedMotion();
      // Smooth zoom interpolation
      const zoomDiff = s.zoom - currentZoom.current;
      if (Math.abs(zoomDiff) > 0.002) {
        currentZoom.current = reducedMotion
          ? s.zoom
          : currentZoom.current + zoomDiff * 0.18;
        dirty = true;
      } else {
        currentZoom.current = s.zoom;
      }

      if (target && reducedMotion) {
        rotation.current = { ...target };
        target = null;
        dirty = true;
      }
      if (target) {
        rotation.current.yaw += (target.yaw - rotation.current.yaw) * 0.14;
        rotation.current.pitch += (target.pitch - rotation.current.pitch) * 0.14;
        if (
          Math.abs(target.yaw - rotation.current.yaw) +
            Math.abs(target.pitch - rotation.current.pitch) <
          0.001
        ) {
          rotation.current = { ...target };
          target = null;
        }
        dirty = true;
      } else if (!drag && (Math.abs(velYaw) > 0.00015 || Math.abs(velPitch) > 0.00015)) {
        // Gentle inertial coast after drag release
        rotation.current.yaw += velYaw;
        rotation.current.pitch = Math.max(
          -1.32,
          Math.min(1.32, rotation.current.pitch + velPitch),
        );
        velYaw *= 0.88;
        velPitch *= 0.88;
        if (Math.abs(velYaw) <= 0.00015) velYaw = 0;
        if (Math.abs(velPitch) <= 0.00015) velPitch = 0;
        dirty = true;
      } else if (
        s.autoRotate &&
        (!reducedMotion || s.motionOverride) &&
        !drag &&
        !hovering &&
        currentZoom.current <= 1.15
      ) {
        // Throttle idle rotation to ~30fps on constrained/reduced-quality devices to protect battery
        const throttleIdle = s.earthQuality === "reduced" || constrained;
        if (!throttleIdle || time - lastIdleDraw >= 32) {
          const stepMs = throttleIdle && lastIdleDraw ? Math.min(120, time - lastIdleDraw) : delta;
          rotation.current.yaw += (stepMs * Math.PI * 2) / 95000;
          lastIdleDraw = time;
          dirty = true;
        }
      }

      // Sync exchange venue & arc buffers
      const signature = s.venues.map((v) => v.id).join("|");
      if (signature !== venueSignature) {
        venueSignature = signature;
        const clusters = clusterVenues(s.venues);
        pointBuffer = syncPointBuffer(pointBuffer, clusters, 1.018);
        const arcs: number[] = [];
        for (let i = 1; i < clusters.length; i += 3) {
          const curve = greatCircle(clusters[i - 1], clusters[i]);
          for (let k = 3; k < curve.length; k += 3)
            arcs.push(...curve.slice(k - 3, k), ...curve.slice(k, k + 3));
        }
        if (arcBuffer) {
          gl!.deleteBuffer(arcBuffer.b);
          buffers.delete(arcBuffer.b);
        }
        arcBuffer = arcs.length > 0 ? buffer(arcs) : null;
        dirty = true;
      }

      const currentSelectedId = s.selected?.id ?? "";
      if (currentSelectedId !== selectedBufferId) {
        selectedBufferId = currentSelectedId;
        selectedPointBuffer = syncPointBuffer(
          selectedPointBuffer,
          s.selected ? [s.selected] : [],
          1.022,
        );
        dirty = true;
      }

      const quakes = s.hazardPoints
        .filter((h) => h.kind === "EARTHQUAKE")
        .slice(0, 60);
      const nextQuakeSig = quakes.map((q) => q.id).join("|");
      if (nextQuakeSig !== quakeSig) {
        quakeSig = nextQuakeSig;
        quakePointBuffer = syncPointBuffer(quakePointBuffer, quakes, 1.024);
        dirty = true;
      }

      const disasters = s.hazardPoints
        .filter((h) => h.kind === "DISASTER")
        .slice(0, 40);
      const nextDisSig = disasters.map((d) => d.id).join("|");
      if (nextDisSig !== disasterSig) {
        disasterSig = nextDisSig;
        disasterPointBuffer = syncPointBuffer(
          disasterPointBuffer,
          disasters,
          1.024,
        );
        dirty = true;
      }

      const nextCountrySig = s.countryPoints.map((c) => c.id).join("|");
      if (nextCountrySig !== countrySig) {
        countrySig = nextCountrySig;
        countryPointBuffer = syncPointBuffer(
          countryPointBuffer,
          s.countryPoints,
          1.02,
        );
        dirty = true;
      }

      const nextConflictSig = s.conflictPoints
        .slice(0, 200)
        .map((c) => c.id)
        .join("|");
      if (nextConflictSig !== conflictSig) {
        conflictSig = nextConflictSig;
        conflictPointBuffer = syncPointBuffer(
          conflictPointBuffer,
          s.conflictPoints.slice(0, 200),
          1.026,
        );
        dirty = true;
      }

      const allDynamicMarkers = [
        ...s.hazardPoints,
        ...s.countryPoints,
        ...s.conflictPoints,
      ];
      const matchedMarker = s.selectedMarkerId
        ? allDynamicMarkers.find((m) => m.id === s.selectedMarkerId) ?? null
        : null;
      const nextSelMarkerSig = matchedMarker ? matchedMarker.id : "";
      if (nextSelMarkerSig !== selectedMarkerSig) {
        selectedMarkerSig = nextSelMarkerSig;
        selectedMarkerBuffer = syncPointBuffer(
          selectedMarkerBuffer,
          matchedMarker ? [matchedMarker] : [],
          1.029,
        );
        dirty = true;
      }

      if (dirty || target) {
        const dprCap =
          s.earthQuality === "reduced"
            ? 1
            : s.earthQuality === "balanced" || constrained
              ? 1.5
              : 2;
        const rect = el.getBoundingClientRect(),
          dpr = Math.min(window.devicePixelRatio || 1, dprCap),
          width = Math.max(1, Math.round(rect.width * dpr)),
          height = Math.max(1, Math.round(rect.height * dpr));
        if (el.width !== width || el.height !== height) {
          el.width = width;
          el.height = height;
        }
        const cam = globeCameraParams(currentZoom.current, rect.width || 1, rect.height || 1);
        gl!.viewport(0, 0, width, height);
        gl!.clearColor(0, 0, 0, 0);
        gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
        gl!.useProgram(program);
        gl!.enable(gl!.DEPTH_TEST);
        gl!.enable(gl!.BLEND);
        gl!.blendFuncSeparate(
          gl!.SRC_ALPHA,
          gl!.ONE_MINUS_SRC_ALPHA,
          gl!.ONE,
          gl!.ONE_MINUS_SRC_ALPHA,
        );

        const sunW = solarDirection(Date.now());
        const sunV = rotateToView(
          sunW,
          rotation.current.yaw,
          rotation.current.pitch,
        );
        gl!.uniform2f(uRotation, rotation.current.yaw, rotation.current.pitch);
        gl!.uniform1f(uCameraDist, cam.cameraDist);
        gl!.uniform1f(uFocalEff, cam.focalEff);
        gl!.uniform1f(uAspect, cam.aspect);
        gl!.uniform1f(uNear, GLOBE_CAMERA_NEAR);
        gl!.uniform1f(uFar, GLOBE_CAMERA_FAR);
        gl!.uniform1f(uHorizonZ, cam.horizonZ);
        gl!.uniform3fv(uSunDir, sunW);
        gl!.uniform3fv(uSunView, sunV);
        gl!.uniform1i(dayUniform, 0);
        gl!.uniform1i(nightUniform, 1);
        gl!.uniform1i(cloudUniform, 2);
        gl!.uniform1f(readyUniform, textureReady ? 1 : 0);
        gl!.uniform1f(cloudReadyUniform, cloudReady ? 1 : 0);

        drawBuffer(sphereBuffer, 0, [0, 0, 0, 1], gl!.TRIANGLES);

        const zoomPtBoost = 1 + (currentZoom.current - 1) * 0.12;
        if (s.showArcs && arcBuffer) {
          drawBuffer(arcBuffer, 1, [0.76, 0.85, 0.94, 0.22], gl!.LINES);
        }
        if (s.showExchanges && pointBuffer) {
          drawBuffer(
            pointBuffer,
            2,
            [0.94, 0.97, 1.0, 0.96],
            gl!.POINTS,
            7.5 * zoomPtBoost * dpr,
          );
        }
        if (countryPointBuffer) {
          drawBuffer(
            countryPointBuffer,
            2,
            [0.24, 0.84, 0.62, 0.94],
            gl!.POINTS,
            8.5 * zoomPtBoost * dpr,
          );
        }
        if (disasterPointBuffer) {
          drawBuffer(
            disasterPointBuffer,
            2,
            [0.22, 0.75, 0.98, 0.96],
            gl!.POINTS,
            9 * zoomPtBoost * dpr,
          );
        }
        if (quakePointBuffer) {
          drawBuffer(
            quakePointBuffer,
            2,
            [0.96, 0.64, 0.08, 0.98],
            gl!.POINTS,
            9.5 * zoomPtBoost * dpr,
          );
        }
        if (conflictPointBuffer) {
          drawBuffer(
            conflictPointBuffer,
            2,
            [0.94, 0.27, 0.27, 0.96],
            gl!.POINTS,
            9 * zoomPtBoost * dpr,
          );
        }
        if (s.showExchanges && selectedPointBuffer) {
          drawBuffer(
            selectedPointBuffer,
            3,
            [0.46, 0.75, 1.0, 0.96],
            gl!.POINTS,
            17 * zoomPtBoost * dpr,
          );
          drawBuffer(
            selectedPointBuffer,
            2,
            [0.96, 0.99, 1.0, 1.0],
            gl!.POINTS,
            8.5 * zoomPtBoost * dpr,
          );
        }
        if (selectedMarkerBuffer) {
          drawBuffer(
            selectedMarkerBuffer,
            3,
            [0.46, 0.75, 1.0, 0.98],
            gl!.POINTS,
            19 * zoomPtBoost * dpr,
          );
        }

        el.dataset.visibility = "visible";
        el.dataset.renderer = "webgl";
        el.dataset.projection = "perspective";
        el.dataset.zoom = currentZoom.current.toFixed(2);
        el.dataset.solarLighting = "approximate-utc";
        el.dataset.frameCount = String(++frames);
        el.dataset.rotation = rotation.current.yaw.toFixed(4);
        el.dataset.motion =
          reducedMotion && !s.motionOverride
            ? "reduced"
            : s.autoRotate
              ? "rotating"
              : "paused";
        dirty = false;
      }

      const animating =
        Math.abs(s.zoom - currentZoom.current) > 0.002 ||
        !!target ||
        Math.abs(velYaw) > 0.00015 ||
        Math.abs(velPitch) > 0.00015 ||
        (s.autoRotate &&
          (!reducedMotion || s.motionOverride) &&
          !hovering &&
          currentZoom.current <= 1.15);
      if (animating) frame = requestAnimationFrame(safeDraw);
    }

    function safeDraw(time: number) {
      try {
        draw(time);
      } catch {
        cancelAnimationFrame(frame);
        frame = 0;
        setSatelliteStage("failed");
        setFailure(true);
      }
    }

    function start() {
      if (!frame && !stopped) {
        dirty = true;
        frame = requestAnimationFrame(safeDraw);
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) {
          beginTextures();
          last = 0;
          start();
        } else {
          cancelAnimationFrame(frame);
          frame = 0;
          el.dataset.visibility = "paused";
        }
      },
      { threshold: 0.02 },
    );
    observer.observe(el);

    const resize = new ResizeObserver(start);
    resize.observe(el);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        el.dataset.visibility = "hidden";
      } else {
        last = 0;
        start();
      }
    };

    const currentPinchDistance = () => {
      if (activePointers.size < 2) return null;
      const [a, b] = [...activePointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        drag = null;
        velYaw = 0;
        velPitch = 0;
        pinchDistance = currentPinchDistance();
        settings.current.onPause();
        return;
      }
      if (drag) return;
      drag = {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        id: e.pointerId,
      };
      target = null;
      velYaw = 0;
      velPitch = 0;
      settings.current.onPause();
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (activePointers.size >= 2) {
        const nextDist = currentPinchDistance();
        if (nextDist !== null && pinchDistance !== null && pinchDistance > 8) {
          const ratio = nextDist / pinchDistance;
          const nextZoom = clampGlobeZoom(settings.current.zoom * ratio);
          settings.current.onZoom(Math.round(nextZoom * 100) / 100);
          pinchDistance = nextDist;
          start();
        }
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      // Adaptive drag sensitivity scales cleanly when zoomed in up to 5x
      const sens = 0.0056 / Math.pow(currentZoom.current, 0.85);
      const dYaw = dx * sens;
      const dPitch = dy * sens * 0.85;
      rotation.current.yaw += dYaw;
      rotation.current.pitch = Math.max(
        -1.32,
        Math.min(1.32, rotation.current.pitch + dPitch),
      );
      if (!reduced.matches) {
        velYaw = dYaw * 0.6;
        velPitch = dPitch * 0.6;
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      start();
    };

    const pickAt = (clientX: number, clientY: number): boolean => {
      const rect = el.getBoundingClientRect();
      const s = settings.current;
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const z = currentZoom.current;

      // 1. Check dynamic event & country markers first (conflicts, earthquakes, disasters, countries)
      const dynamicMarkers: GlobePointMarker[] = [
        ...s.conflictPoints.slice(0, 200),
        ...s.hazardPoints,
        ...s.countryPoints,
      ];
      const markerHit = dynamicMarkers
        .map((m) => ({
          m,
          p: projectPerspective(
            m,
            rotation.current.yaw,
            rotation.current.pitch,
            rect.width,
            rect.height,
            z,
            1.024,
          ),
        }))
        .filter(({ p }) => p.visible && p.inViewport)
        .map(({ m, p }) => ({ m, d: Math.hypot(px - p.x, py - p.y) }))
        .filter((x) => x.d < 22)
        .sort((a, b) => a.d - b.d)[0];

      if (markerHit && s.onSelectMarker) {
        s.onSelectMarker(markerHit.m);
        return true;
      }

      // 2. Check exchange hubs
      if (s.showExchanges) {
        const candidates = s.venues
          .map((v) => ({
            v,
            p: projectPerspective(
              v,
              rotation.current.yaw,
              rotation.current.pitch,
              rect.width,
              rect.height,
              z,
              1.018,
            ),
          }))
          .filter(({ p }) => p.visible && p.inViewport)
          .map(({ v, p }) => ({ v, d: Math.hypot(px - p.x, py - p.y) }))
          .filter((c) => c.d < 24)
          .sort((a, b) => a.d - b.d);

        if (candidates[0]) {
          const same = candidates.filter(
            (c) => Math.abs(c.d - candidates[0].d) < 4,
          );
          const index = same.findIndex((c) => c.v.id === s.selected?.id);
          s.onSelect(same[(index + 1) % same.length].v);
          return true;
        }
      }
      return false;
    };

    const zoomTowardClientPoint = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const hit = unprojectScreenToLatLon(
        clientX - rect.left,
        clientY - rect.top,
        rotation.current.yaw,
        rotation.current.pitch,
        rect.width,
        rect.height,
        currentZoom.current,
      );
      if (!hit) return;
      settings.current.onPause();
      aimAt(hit.lat, hit.lon);
      const cur = settings.current.zoom;
      const next =
        cur < 1.7 ? 2.1 : cur < 3.1 ? 3.5 : cur < 4.6 ? 5.0 : GLOBE_ZOOM_MIN;
      settings.current.onZoom(next, hit);
      start();
    };

    const onUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) pinchDistance = null;
      if (!drag || drag.id !== e.pointerId) return;
      const active = drag;
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
      const click =
        Math.hypot(e.clientX - active.startX, e.clientY - active.startY) < 8;
      drag = null;
      if (click) {
        velYaw = 0;
        velPitch = 0;
        const now = performance.now();
        const isDoubleTap =
          now - lastTapTime < 340 &&
          Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 28;
        lastTapTime = now;
        lastTapX = e.clientX;
        lastTapY = e.clientY;
        const hitMarker = pickAt(e.clientX, e.clientY);
        if (!hitMarker && isDoubleTap) {
          zoomTowardClientPoint(e.clientX, e.clientY);
        }
      }
      start();
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
      frame = 0;
      setSatelliteStage("failed");
      setFailure(true);
    };

    const onRestored = () => {
      setSatelliteStage("preparing");
      setFailure(false);
      setRetryNonce((n) => n + 1);
    };

    const onCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) pinchDistance = null;
      if (drag?.id === e.pointerId) drag = null;
    };

    const onWheel = (e: WheelEvent) => {
      // Only intercept scroll wheel when user explicitly focuses the globe, holds Ctrl/pinch trackpad,
      // or is already zoomed into regional exploration — never hijack casual vertical page scroll!
      if (
        !e.ctrlKey &&
        document.activeElement !== el &&
        settings.current.zoom <= GLOBE_ZOOM_MIN + 0.05
      ) {
        return;
      }
      e.preventDefault();
      settings.current.onPause();
      const factor = Math.exp(-e.deltaY * 0.0022);
      const next = clampGlobeZoom(settings.current.zoom * factor);
      const box = el.getBoundingClientRect();
      const focus = unprojectScreenToLatLon(e.clientX - box.left, e.clientY - box.top,
        rotation.current.yaw, rotation.current.pitch, box.width, box.height, currentZoom.current);
      settings.current.onZoom(Math.round(next * 100) / 100, focus);
      start();
    };

    const onKey = (e: KeyboardEvent) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "=",
          "-",
          "_",
          "0",
          "Home",
        ].includes(e.key)
      )
        return;
      e.preventDefault();
      settings.current.onPause();
      target = null;
      velYaw = 0;
      velPitch = 0;
      const step = 0.12 / Math.pow(currentZoom.current, 0.7);
      if (e.key === "ArrowLeft") rotation.current.yaw -= step;
      if (e.key === "ArrowRight") rotation.current.yaw += step;
      if (e.key === "ArrowUp")
        rotation.current.pitch = Math.max(-1.32, rotation.current.pitch - step);
      if (e.key === "ArrowDown")
        rotation.current.pitch = Math.min(1.32, rotation.current.pitch + step);
      if (e.key === "+" || e.key === "=") {
        settings.current.onZoom(
          Math.round(clampGlobeZoom(settings.current.zoom * 1.32) * 100) / 100,
        );
      }
      if (e.key === "-" || e.key === "_") {
        settings.current.onZoom(
          Math.round(clampGlobeZoom(settings.current.zoom / 1.32) * 100) / 100,
        );
      }
      if (e.key === "0" || e.key === "Home") {
        settings.current.onZoom(GLOBE_ZOOM_MIN);
        target = { yaw: -1.36, pitch: 0.34 };
      }
      start();
    };

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== "touch") {
        hovering = true;
        start();
      }
    };
    const onLeave = () => {
      hovering = false;
      last = 0;
      start();
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("keydown", onKey);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("lostpointercapture", onCancel);
    el.addEventListener("webglcontextlost", onLost);
    el.addEventListener("webglcontextrestored", onRestored);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", start);
    const onRender = () => start();
    el.addEventListener("x1-render", onRender);

    return () => {
      stopped = true;
      controller.abort();
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", start);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("lostpointercapture", onCancel);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("webglcontextlost", onLost);
      el.removeEventListener("webglcontextrestored", onRestored);
      el.removeEventListener("x1-render", onRender);
      textures.forEach((t) => gl.deleteTexture(t));
      buffers.forEach((b) => gl.deleteBuffer(b));
      shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [forceFallback, failure, retryNonce]);

  useEffect(() => {
    canvas.current?.dispatchEvent(new Event("x1-render"));
  }, [
    venues,
    selected,
    autoRotate,
    motionOverride,
    resetToken,
    zoom,
    focusCoords,
    hazardPoints,
    countryPoints,
    conflictPoints,
    selectedMarkerId,
    showExchanges,
    showArcs,
    earthQuality,
  ]);

  if (failure || forceFallback)
    return (
      <div className="x1-earth-fallback" role="status">
        <img
          className="x1-earth-static"
          src="/data/earth-static.jpg"
          alt="NASA Blue Marble eastern-hemisphere natural-color historical composite"
        />
        <p>
          Natural-color static Earth · WebGL 3D renderer unavailable on this
          browser. Open Info for keyboard-accessible event and venue records.
        </p>
        {failure && !forceFallback && (
          <button
            type="button"
            className="x1-secondary"
            onClick={() => {
              setSatelliteStage("preparing");
              setFailure(false);
              setRetryNonce((n) => n + 1);
            }}
          >
            Retry 3D globe
          </button>
        )}
      </div>
    );

  return (
    <div
      className="x1-satellite-renderer"
      data-earth-stage={satelliteStage}
    >
      <canvas
        ref={canvas}
        className="x1-globe-canvas"
        role="img"
        tabIndex={0}
        aria-label="Interactive natural-color 3D Earth with 24 global exchange cities, USGS seismic events, NASA EONET natural disasters, and approximate UTC solar day and night lighting. Drag to rotate, pinch or double-tap to zoom up to 5x, or use arrow keys and plus or minus keys."
      />
      {(satelliteStage === "preparing" || satelliteStage === "loading") && (
        <div className="x1-satellite-loading" role="status">
          <span aria-hidden="true" />
          {satelliteStage === "preparing"
            ? "Preparing 3D Earth…"
            : "Loading NASA Earth imagery…"}
        </div>
      )}
    </div>
  );
}
