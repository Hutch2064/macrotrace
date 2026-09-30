import { countries } from "./countries.js";
import { format, signed } from "./common.js";

// Orthographic spherical geometry: no WebGL runtime or animation framework.
export async function economicGlobe(canvas, onSelect, readings = new Map()) {
  const context = canvas.getContext("2d");
  if (!context) return { select() {}, setReadings() {}, destroy() {} };
  const response = await fetch("./world.json");
  if (!response.ok) throw new Error("The world map could not be loaded.");
  const map = await response.json();
  const radians = Math.PI / 180;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0,
    height = 0,
    radius = 0,
    frame,
    last = 0;
  let yaw = -90 * radians,
    pitch = 24 * radians;
  let selected = "USA",
    hover,
    destination,
    start,
    dragging = false;
  let visible = true,
    destroyed = false;
  const listeners = [];
  const listen = (target, event, callback) => {
    target.addEventListener(event, callback);
    listeners.push(() => target.removeEventListener(event, callback));
  };
  const sphere = ([lon, lat]) => {
    const a = lon * radians,
      b = lat * radians;
    return [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)];
  };
  const outlines = map.countries.map((country) => ({
    ...country,
    paths: country.polygons.flatMap((polygon) =>
      polygon.map((ring) => ring.map(sphere)),
    ),
  }));
  const project = ([x, y, z]) => {
    const rx = x * Math.cos(yaw) - z * Math.sin(yaw);
    const rz = x * Math.sin(yaw) + z * Math.cos(yaw);
    const ry = y * Math.cos(pitch) - rz * Math.sin(pitch);
    const depth = y * Math.sin(pitch) + rz * Math.cos(pitch);
    return [width / 2 + rx * radius, height / 2 - ry * radius, depth];
  };
  function stroke(points, color, lineWidth = 0.7) {
    context.beginPath();
    let started = false;
    for (const point of points) {
      const [x, y, z] = project(point);
      if (z < 0) {
        started = false;
        continue;
      }
      if (started) context.lineTo(x, y);
      else context.moveTo(x, y);
      started = true;
    }
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();
  }
  function fill(country, color) {
    context.beginPath();
    for (const ring of country.paths) {
      const points = ring.map(project);
      let previous = points.at(-1),
        started = false;
      const add = (x, y) => {
        if (started) context.lineTo(x, y);
        else {
          context.moveTo(x, y);
          started = true;
        }
      };
      for (const point of points) {
        if (point[2] >= 0 !== previous[2] >= 0) {
          const t = previous[2] / (previous[2] - point[2]);
          const x = previous[0] + t * (point[0] - previous[0]) - width / 2;
          const y = previous[1] + t * (point[1] - previous[1]) - height / 2;
          const length = Math.hypot(x, y);
          if (length)
            add(
              width / 2 + (radius * x) / length,
              height / 2 + (radius * y) / length,
            );
        }
        if (point[2] >= 0) add(point[0], point[1]);
        previous = point;
      }
      context.closePath();
    }
    context.fillStyle = color;
    context.fill("evenodd");
  }
  const tone = (id) => {
    const change = readings.get(id)?.change;
    return Number.isFinite(change) && change !== 0
      ? change > 0
        ? "125,211,167"
        : "241,151,141"
      : "183,181,169";
  };
  const grid = [];
  for (let lat = -60; lat <= 60; lat += 30)
    grid.push(Array.from({ length: 121 }, (_, i) => sphere([i * 3, lat])));
  for (let lon = 0; lon < 360; lon += 30)
    grid.push(Array.from({ length: 61 }, (_, i) => sphere([lon, -90 + i * 3])));
  function draw() {
    if (!width || destroyed) return;
    context.clearRect(0, 0, width, height);
    const glow = context.createRadialGradient(
      width / 2,
      height / 2,
      radius * 0.6,
      width / 2,
      height / 2,
      radius * 1.25,
    );
    glow.addColorStop(0, "rgba(207,185,125,.08)");
    glow.addColorStop(1, "rgba(207,185,125,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    const ocean = context.createRadialGradient(
      width * 0.4,
      height * 0.32,
      0,
      width / 2,
      height / 2,
      radius,
    );
    ocean.addColorStop(0, "#35352e");
    ocean.addColorStop(0.72, "#2a2a26");
    ocean.addColorStop(1, "#20201e");
    context.beginPath();
    context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    context.fillStyle = ocean;
    context.fill();
    context.strokeStyle = "rgba(207,185,125,.3)";
    context.stroke();
    for (const points of grid) stroke(points, "rgba(207,185,125,.11)");
    for (const country of outlines) {
      const emphasized = country.id === selected || country.id === hover;
      const available = Number.isFinite(readings.get(country.id)?.change);
      if (available) fill(country, `rgba(${tone(country.id)},0.3)`);
      for (const points of country.paths)
        stroke(
          points,
          emphasized
            ? "rgba(253,229,182,.95)"
            : `rgba(${tone(country.id)},${available ? 0.7 : 0.28})`,
          emphasized ? 1.5 : 0.8,
        );
    }
    for (const country of countries) {
      const [x, y, z] = project(sphere([country.lon, country.lat]));
      if (z < 0.04) continue;
      const emphasized = country.id === selected || country.id === hover;
      context.beginPath();
      context.arc(x, y, emphasized ? 5 : 3, 0, Math.PI * 2);
      context.fillStyle = emphasized ? "#fde5b6" : `rgb(${tone(country.id)})`;
      context.fill();
      context.beginPath();
      context.arc(x, y, emphasized ? 11 : 7, 0, Math.PI * 2);
      context.strokeStyle = emphasized
        ? "rgba(253,229,182,.45)"
        : "rgba(207,185,125,.25)";
      context.stroke();
    }
  }
  function animate(time) {
    frame = undefined;
    if (destroyed || !visible || document.hidden) return;
    if (time - last >= 33) {
      if (destination) {
        const delta = Math.atan2(
          Math.sin(destination.yaw - yaw),
          Math.cos(destination.yaw - yaw),
        );
        const latitude = destination.pitch - pitch;
        yaw += delta * 0.065;
        pitch += latitude * 0.065;
        if (Math.abs(delta) + Math.abs(latitude) < 0.002) destination = null;
      } else if (!dragging && !reduced.matches) yaw += 0.00065;
      draw();
      last = time;
    }
    if (!reduced.matches || destination) frame = requestAnimationFrame(animate);
  }
  const restart = () => {
    cancelAnimationFrame(frame);
    draw();
    if (visible && !document.hidden && !reduced.matches)
      frame = requestAnimationFrame(animate);
  };
  function select(id) {
    const country = countries.find((country) => country.id === id);
    if (!country) return;
    selected = id;
    destination = { yaw: country.lon * radians, pitch: country.lat * radians };
    if (reduced.matches) {
      yaw = destination.yaw;
      pitch = destination.pitch;
      destination = null;
    }
    restart();
  }
  function hit(event) {
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left,
      y = event.clientY - bounds.top;
    let near,
      distance = 22;
    for (const country of countries) {
      const [cx, cy, z] = project(sphere([country.lon, country.lat]));
      const delta = Math.hypot(cx - x, cy - y);
      if (z > 0 && delta < distance) {
        distance = delta;
        near = country.id;
      }
    }
    if (near) return near;
    // Invert the front hemisphere so the full country area, not only its pin, responds.
    const sx = (x - width / 2) / radius,
      sy = -(y - height / 2) / radius;
    if (sx * sx + sy * sy > 1) return;
    const depth = Math.sqrt(1 - sx * sx - sy * sy);
    const ry = sy * Math.cos(pitch) + depth * Math.sin(pitch);
    const rz = depth * Math.cos(pitch) - sy * Math.sin(pitch);
    const lon = (Math.atan2(sx, rz) + yaw) / radians;
    const point = [((lon + 540) % 360) - 180, Math.asin(ry) / radians];
    const inside = (ring) => {
      let result = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i],
          [bx, by] = ring[j];
        if (
          ay > point[1] !== by > point[1] &&
          point[0] < ((bx - ax) * (point[1] - ay)) / (by - ay) + ax
        )
          result = !result;
      }
      return result;
    };
    return map.countries.find(
      (country) =>
        countries.some(({ id }) => id === country.id) &&
        country.polygons.some(
          ([outer, ...holes]) => inside(outer) && !holes.some(inside),
        ),
    )?.id;
  }
  listen(canvas, "pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, yaw, pitch };
    dragging = false;
    destination = null;
  });
  listen(canvas, "pointermove", (event) => {
    if (start) {
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) > 6) {
        dragging = true;
        canvas.setPointerCapture(event.pointerId);
      }
      if (dragging) {
        yaw = start.yaw - dx * 0.006;
        pitch = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, start.pitch + dy * 0.006),
        );
        draw();
      }
    } else {
      hover = hit(event);
      canvas.style.cursor = hover ? "pointer" : "grab";
      canvas.title = hover
        ? (() => {
            const name = countries.find(({ id }) => id === hover).name;
            const reading = readings.get(hover);
            return `${name} · ${reading?.year || "No annual reading"}${Number.isFinite(reading?.value) ? ` · Real GDP growth ${format(reading.value)}%` : ""}${Number.isFinite(reading?.change) ? ` · ${signed(reading.change)} pp vs ${Number(reading.year) - 1}` : " · Annual comparison unavailable"}${reading?.retained ? " · Retained snapshot" : ""}`;
          })()
        : "Drag in any direction · choose a highlighted country";
      draw();
    }
  });
  listen(canvas, "pointerup", (event) => {
    if (
      start &&
      !dragging &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
    ) {
      const id = hit(event);
      if (id) {
        select(id);
        onSelect(id);
      }
    }
    start = null;
    dragging = false;
  });
  listen(canvas, "pointercancel", () => {
    start = null;
    dragging = false;
  });
  listen(canvas, "pointerleave", () => {
    hover = null;
    if (!dragging) start = null;
    draw();
  });
  listen(canvas, "keydown", (event) => {
    if (["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      destination = null;
      pitch = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, pitch + (event.key === "ArrowUp" ? -0.2 : 0.2)),
      );
      restart();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    const index = countries.findIndex(({ id }) => id === selected);
    const next =
      countries[
        event.key === "Home"
          ? 0
          : (index + (event.key === "ArrowRight" ? 1 : -1) + countries.length) %
            countries.length
      ];
    select(next.id);
    onSelect(next.id);
  });
  const resize = new ResizeObserver(() => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    radius = Math.min(width, height) * 0.43;
    const ratio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  });
  resize.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    restart();
  });
  intersection.observe(canvas);
  listen(document, "visibilitychange", restart);
  listen(reduced, "change", restart);
  return {
    select,
    setReadings(updated) {
      readings = updated;
      draw();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      listeners.forEach((remove) => remove());
    },
  };
}
