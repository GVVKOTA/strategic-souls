"use client";
import { useEffect, useRef, useState } from "react";
import { clusterVenues, greatCircle, project, xyz } from "../lib/x1/globe";
import type { Exchange } from "../lib/x1/exchanges";
type Props = {
  venues: Exchange[];
  selected: Exchange | null;
  autoRotate: boolean;
  onPause: () => void;
  onSelect: (venue: Exchange) => void;
  onZoom: (zoom: number) => void;
  zoom: number;
  forceFallback?: boolean;
  motionOverride?: boolean;
  resetToken?: number;
  onFallbackChange?: (fallback: boolean) => void;
};
const vertex = `attribute vec3 aPosition;uniform vec2 uRotation;uniform float uScale;uniform float uAspect;uniform float uPointSize;varying vec3 vPosition;varying vec3 vWorld;void main(){float c=cos(uRotation.x),s=sin(uRotation.x),p=cos(uRotation.y),q=sin(uRotation.y);vec3 a=vec3(c*aPosition.x+s*aPosition.z,aPosition.y,-s*aPosition.x+c*aPosition.z);vWorld=aPosition;vPosition=vec3(a.x,p*a.y-q*a.z,q*a.y+p*a.z);gl_Position=vec4(vPosition.x*uScale/uAspect,vPosition.y*uScale,-vPosition.z*.4,1.0);gl_PointSize=uPointSize;}`;
const fragment = `precision mediump float;varying vec3 vPosition;varying vec3 vWorld;uniform vec4 uColor;uniform float uMode;uniform sampler2D uDay;uniform sampler2D uNight;uniform sampler2D uCloud;uniform float uTextureReady;uniform float uCloudReady;float luminance(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}void main(){if(uMode<.5){vec3 n=normalize(vPosition),w=normalize(vWorld);vec2 uv=vec2(atan(w.x,w.z)/6.28318530718+.5,asin(clamp(w.y,-1.,1.))/3.14159265359+.5);float light=dot(n,normalize(vec3(-.58,.40,1.0)));float terrain=luminance(texture2D(uDay,uv).rgb);float night=luminance(texture2D(uNight,uv).rgb);float shade=.18+.82*max(0.,light);float value=(.055+.82*pow(terrain,.78))*shade;float nightMask=1.-smoothstep(-.05,.55,light);value+=pow(max(0.,night-.055),.8)*nightMask*.70;float clouds=luminance(texture2D(uCloud,uv).rgb)*uCloudReady;value=mix(value,.26+.58*max(0.,light),clamp(pow(clouds,1.9)*.48,0.,.65));float rim=pow(1.-max(0.,n.z),4.)*.12;value=mix(.075,value,uTextureReady)+rim;gl_FragColor=vec4(vec3(clamp(value,0.,.94)),1.);}else if(uMode>1.5){if(vPosition.z<0.)discard;float d=length(gl_PointCoord-vec2(.5));if(d>.5||(uMode>2.5&&d<.32))discard;gl_FragColor=vec4(uColor.rgb,uColor.a*(1.-smoothstep(.40,.5,d)));}else{gl_FragColor=uColor;}}`;
/** Native WebGL sphere with locally hosted, historically dated NASA textures. */
export default function GlobeCanvas({
  venues,
  selected,
  autoRotate,
  onPause,
  onSelect,
  onZoom,
  zoom,
  forceFallback = false,
  motionOverride = false,
  resetToken = 0,
  onFallbackChange,
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
      zoom,
    }),
    rotation = useRef({ yaw: -0.65, pitch: 0.2 }),
    [failure, setFailure] = useState(false),
    [satelliteStage, setSatelliteStage] = useState<"loading" | "ready">(
      "loading",
    );
  useEffect(() => {
    onFallbackChange?.(forceFallback || failure);
  }, [forceFallback, failure, onFallbackChange]);
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
      zoom,
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
  ]);
  useEffect(() => {
    const candidate = canvas.current;
    if (!candidate || forceFallback || failure) return;
    const el: HTMLCanvasElement = candidate;
    const gl = el.getContext("webgl", {
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      queueMicrotask(() => setFailure(true));
      return;
    }
    let stopped = false,
      frame = 0,
      visible = false,
      last = 0,
      dirty = true,
      hovering = false,
      resetSeen = -1,
      drag: {
        x: number;
        y: number;
        startX: number;
        startY: number;
        id: number;
      } | null = null,
      selectedId = "",
      target: { yaw: number; pitch: number } | null = null;
    const buffers: WebGLBuffer[] = [],
      shaders: WebGLShader[] = [],
      textures: WebGLTexture[] = [];
    const program = gl.createProgram();
    if (!program) {
      queueMicrotask(() => setFailure(true));
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
      queueMicrotask(() => setFailure(true));
      return;
    }
    const position = gl.getAttribLocation(program, "aPosition"),
      uRotation = gl.getUniformLocation(program, "uRotation"),
      uScale = gl.getUniformLocation(program, "uScale"),
      uAspect = gl.getUniformLocation(program, "uAspect"),
      uMode = gl.getUniformLocation(program, "uMode"),
      uColor = gl.getUniformLocation(program, "uColor"),
      uPointSize = gl.getUniformLocation(program, "uPointSize");
    function buffer(vertices: number[]) {
      const b = gl!.createBuffer();
      if (!b) throw new Error("Buffer allocation failed");
      buffers.push(b);
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
    const sphere: number[] = [];
    for (let a = 0; a < 32; a++)
      for (let b = 0; b < 64; b++) {
        const p = (i: number, j: number) =>
          xyz({ lat: -90 + (i * 180) / 32, lon: (j * 360) / 64 });
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
      queueMicrotask(() => setFailure(true));
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
    function makeTexture(unit: number, gray: number) {
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
        new Uint8Array([gray, gray, gray, 255]),
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
      dayTexture = makeTexture(0, 45);
      nightTexture = makeTexture(1, 0);
      cloudTexture = makeTexture(2, 0);
    } catch {
      textures.forEach((t) => gl.deleteTexture(t));
      releaseInitial();
      return;
    }
    const connection = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
      deviceMemory?: number;
    };
    const constrained =
      window.matchMedia("(max-width:680px)").matches ||
      !!connection.connection?.saveData ||
      (connection.deviceMemory ?? 8) <= 2;
    const textureWidth = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      constrained ? 1024 : 2048,
    );
    const loadTexture = async (
      path: string,
      texture: WebGLTexture,
      unit: number,
    ) => {
      const response = await fetch(path, {
        signal: controller.signal,
        cache: "force-cache",
      });
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
      loadTexture("/data/earth-day.jpg", dayTexture, 0)
        .then(() => {
          if (!stopped) {
            textureReady = true;
            setSatelliteStage("ready");
            el.dataset.satellite = "day";
            start();
          }
        })
        .catch(() => {
          if (!stopped) setFailure(true);
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
      if (!constrained)
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
    let frames = 0;
    let venueSignature = "",
      pointBuffer: { b: WebGLBuffer; count: number } | null = null,
      arcBuffer: { b: WebGLBuffer; count: number } | null = null;
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
      const delta = last ? Math.min(1000, time - last) : 0;
      last = time;
      const s = settings.current;
      if (
        s.selected &&
        (s.selected.id !== selectedId || s.resetToken !== resetSeen)
      ) {
        resetSeen = s.resetToken;
        selectedId = s.selected.id;
        let yaw = (-s.selected.lon * Math.PI) / 180;
        while (yaw - rotation.current.yaw > Math.PI) yaw -= Math.PI * 2;
        while (yaw - rotation.current.yaw < -Math.PI) yaw += Math.PI * 2;
        target = { yaw, pitch: (s.selected.lat * Math.PI) / 180 };
      }
      if (target && reduced.matches) {
        rotation.current = { ...target };
        target = null;
        dirty = true;
      }
      if (target) {
        rotation.current.yaw += (target.yaw - rotation.current.yaw) * 0.13;
        rotation.current.pitch +=
          (target.pitch - rotation.current.pitch) * 0.13;
        if (
          Math.abs(target.yaw - rotation.current.yaw) +
            Math.abs(target.pitch - rotation.current.pitch) <
          0.001
        )
          target = null;
        dirty = true;
      } else if (
        s.autoRotate &&
        (!reduced.matches || s.motionOverride) &&
        !drag &&
        !hovering
      ) {
        rotation.current.yaw += (delta * Math.PI * 2) / 80000;
        dirty = true;
      }
      const signature = s.venues.map((v) => v.id).join("|");
      if (signature !== venueSignature) {
        venueSignature = signature;
        const clusters = clusterVenues(s.venues),
          points = clusters.flatMap((c) => xyz(c, 1.024));
        if (pointBuffer) {
          gl!.deleteBuffer(pointBuffer.b);
        }
        pointBuffer = buffer(points);
        const arcs: number[] = [];
        for (let i = 1; i < clusters.length; i += 3) {
          const curve = greatCircle(clusters[i - 1], clusters[i]);
          for (let k = 3; k < curve.length; k += 3)
            arcs.push(...curve.slice(k - 3, k), ...curve.slice(k, k + 3));
        }
        if (arcBuffer) gl!.deleteBuffer(arcBuffer.b);
        arcBuffer = buffer(arcs);
        dirty = true;
      }
      if (dirty || target) {
        const rect = el.getBoundingClientRect(),
          dpr = Math.min(window.devicePixelRatio || 1, 1.5),
          width = Math.max(1, Math.round(rect.width * dpr)),
          height = Math.max(1, Math.round(rect.height * dpr));
        if (el.width !== width || el.height !== height) {
          el.width = width;
          el.height = height;
        }
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
        gl!.uniform2f(uRotation, rotation.current.yaw, rotation.current.pitch);
        gl!.uniform1f(uAspect, width / height);
        gl!.uniform1f(uScale, Math.min(0.84, (0.84 * width) / height) * s.zoom);
        gl!.uniform1i(dayUniform, 0);
        gl!.uniform1i(nightUniform, 1);
        gl!.uniform1i(cloudUniform, 2);
        gl!.uniform1f(readyUniform, textureReady ? 1 : 0);
        gl!.uniform1f(cloudReadyUniform, cloudReady ? 1 : 0);
        drawBuffer(sphereBuffer, 0, [0, 0, 0, 1], gl!.TRIANGLES);

        if (arcBuffer)
          drawBuffer(arcBuffer, 1, [0.76, 0.76, 0.76, 0.3], gl!.LINES);
        if (pointBuffer)
          drawBuffer(pointBuffer, 2, [0.9, 0.9, 0.9, 1], gl!.POINTS, 7 * dpr);
        el.dataset.visibility = "visible";
        el.dataset.renderer = "webgl";
        el.dataset.frameCount = String(++frames);
        el.dataset.rotation = rotation.current.yaw.toFixed(4);
        el.dataset.motion =
          reduced.matches && !s.motionOverride
            ? "reduced"
            : s.autoRotate
              ? "rotating"
              : "paused";
        dirty = false;
      }
      if (
        (s.autoRotate && (!reduced.matches || s.motionOverride) && !hovering) ||
        target
      )
        frame = requestAnimationFrame(safeDraw);
    }
    function safeDraw(time: number) {
      try {
        draw(time);
      } catch {
        cancelAnimationFrame(frame);
        frame = 0;
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
    const onDown = (e: PointerEvent) => {
      if (drag) return;
      drag = {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        id: e.pointerId,
      };
      target = null;
      settings.current.onPause();
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      rotation.current.yaw += dx * 0.006;
      rotation.current.pitch = Math.max(
        -1.2,
        Math.min(1.2, rotation.current.pitch + dy * 0.004),
      );
      drag.x = e.clientX;
      drag.y = e.clientY;
      start();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const active = drag;
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
      const click =
        Math.hypot(e.clientX - active.startX, e.clientY - active.startY) < 8;
      drag = null;
      if (click) {
        const rect = el.getBoundingClientRect();
        const candidates = settings.current.venues
          .map((v) => ({
            v,
            p: project(
              v,
              rotation.current.yaw,
              rotation.current.pitch,
              rect.width,
              rect.height,
              settings.current.zoom,
            ),
          }))
          .filter(({ p }) => p.visible)
          .map(({ v, p }) => ({
            v,
            d: Math.hypot(
              e.clientX - rect.left - p.x,
              e.clientY - rect.top - p.y,
            ),
          }))
          .filter((c) => c.d < 22)
          .sort((a, b) => a.d - b.d);
        if (candidates[0]) {
          const same = candidates.filter(
            (c) => Math.abs(c.d - candidates[0].d) < 3,
          );
          const index = same.findIndex(
            (c) => c.v.id === settings.current.selected?.id,
          );
          settings.current.onSelect(same[(index + 1) % same.length].v);
        }
      }
      start();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
      frame = 0;
      setFailure(true);
    };
    const onCancel = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && document.activeElement !== el) return;
      e.preventDefault();
      settings.current.onPause();
      settings.current.onZoom(
        Math.min(1.35, Math.max(0.8, settings.current.zoom - e.deltaY * 0.001)),
      );
      start();
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-"].includes(
          e.key,
        )
      )
        return;
      e.preventDefault();
      settings.current.onPause();
      target = null;
      if (e.key === "ArrowLeft") rotation.current.yaw -= 0.08;
      if (e.key === "ArrowRight") rotation.current.yaw += 0.08;
      if (e.key === "ArrowUp")
        rotation.current.pitch = Math.max(-1.2, rotation.current.pitch - 0.08);
      if (e.key === "ArrowDown")
        rotation.current.pitch = Math.min(1.2, rotation.current.pitch + 0.08);
      if (e.key === "+" || e.key === "-")
        settings.current.onZoom(
          Math.min(
            1.35,
            Math.max(0.8, settings.current.zoom + (e.key === "+" ? 0.1 : -0.1)),
          ),
        );
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
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", start);
    // React state changes are infrequent. This event schedules a frame without a 60fps React update.
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
      el.removeEventListener("x1-render", onRender);
      textures.forEach((t) => gl.deleteTexture(t));
      buffers.forEach((b) => gl.deleteBuffer(b));
      shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [forceFallback, failure]);
  useEffect(() => {
    canvas.current?.dispatchEvent(new Event("x1-render"));
  }, [venues, selected, autoRotate, motionOverride, resetToken, zoom]);
  if (failure || forceFallback)
    return (
      <div className="x1-earth-fallback" role="status">
        <img
          className="x1-earth-static"
          src="/data/earth-static.jpg"
          alt="NASA Blue Marble eastern-hemisphere historical composite, displayed in grayscale"
        />
        <p>
          Static satellite Earth ·{" "}
          {forceFallback
            ? "Compatibility view selected."
            : "3D is unavailable."}{" "}
          Use the exchange list for every venue.
        </p>
        {failure && !forceFallback && (
          <button
            className="x1-secondary"
            onClick={() => {
              setSatelliteStage("loading");
              setFailure(false);
            }}
          >
            Retry 3D globe
          </button>
        )}
      </div>
    );
  return (
    <div className="x1-satellite-renderer">
      <canvas
        ref={canvas}
        className="x1-globe-canvas"
        role="img"
        tabIndex={0}
        aria-label="Interactive grayscale satellite Earth with exchange cities. Drag or use arrow keys to rotate; focus and use wheel or plus/minus to zoom. Use the list to select every exchange."
      />
      {satelliteStage === "loading" && (
        <div className="x1-satellite-loading" role="status">
          <span />
          Loading satellite imagery…
        </div>
      )}
    </div>
  );
}
