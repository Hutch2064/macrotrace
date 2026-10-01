// Orthographic spherical geometry: no WebGL runtime or animation framework.
import { geoOrthographic, geoPath } from "d3-geo";
import { displayGeometry } from "./globe-geometry.js";

export async function economicGlobe(
  canvas,
  onSelect,
  readings = new Map(),
  countries = [],
) {
  const context = canvas.getContext("2d");
  if (!context) return { select() {}, setReadings() {}, destroy() {} };
  const response = await fetch("./world.json");
  if (!response.ok) throw new Error("The world map could not be loaded.");
  const map = await response.json();
  const radians = Math.PI / 180;
  const economicCountries = (Array.isArray(countries) ? countries : []).filter(
    (country) => country?.id,
  );
  const economicById = new Map(
    economicCountries.map((country) => [country.id, country]),
  );
  const represented = new Set(
    map.countries.map((country) => country.economicId || country.id),
  );
  const economicPieces = new Map();
  for (const country of map.countries) {
    const id = country.economicId || country.id;
    economicPieces.set(id, (economicPieces.get(id) || 0) + 1);
  }
  const countryList = [
    ...map.countries.map((country) => ({
      ...economicById.get(country.economicId || country.id),
      ...country,
      sharedAggregate: Boolean(
        country.economicId && economicPieces.get(country.economicId) > 1,
      ),
    })),
    ...economicCountries.filter(({ id }) => !represented.has(id)),
  ];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0,
    height = 0,
    radius = 0,
    frame,
    last = 0;
  let yaw = -90 * radians,
    pitch = 24 * radians;
  let selected = countryList.some(({ id }) => id === "USA")
      ? "USA"
      : countryList[0]?.id,
    hover,
    destination,
    start,
    dragging = false,
    pointer,
    tooltipPinned = false;
  let visible = true,
    destroyed = false;
  let dirty = false;
  let zoom = 1,
    surfaceDirty = false,
    geometryRadius = 0,
    pinch;
  const touches = new Map();
  const listeners = [];
  const listen = (target, event, callback, options) => {
    target.addEventListener(event, callback, options);
    listeners.push(() => target.removeEventListener(event, callback, options));
  };
  const sphere = ([lon, lat]) => {
    const a = lon * radians,
      b = lat * radians;
    return [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)];
  };
  // Unwrap each ring continuously across the date line. A plain longitude
  // ray cast makes Russia/Fiji cover the opposite side of the Earth.
  const pickRing = (ring) => {
    let previous = ring[0]?.[0] || 0;
    const points = ring.map(([lon, lat]) => {
      const x = lon + 360 * Math.round((previous - lon) / 360);
      previous = x;
      return [x, lat];
    });
    const xs = points.map(([x]) => x),
      ys = points.map(([, y]) => y);
    return {
      points,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };
  const outlines = map.countries.map((country) => {
    return {
      ...country,
      geometry: { type: "MultiPolygon", coordinates: country.polygons },
      pickPolygons: country.polygons.map((polygon) => polygon.map(pickRing)),
    };
  });
  const outlineById = new Map(outlines.map((country) => [country.id, country]));
  const countryById = new Map(
    countryList.map((country) => {
      const outline = outlineById.get(country.id);
      const lon = Number.isFinite(country.lon)
        ? country.lon
        : Number.isFinite(outline?.lon)
          ? outline.lon
          : null;
      const lat = Number.isFinite(country.lat)
        ? country.lat
        : Number.isFinite(outline?.lat)
          ? outline.lat
          : null;
      return [country.id, { ...country, lon, lat }];
    }),
  );
  const available = (id) =>
    Boolean(
      readings.get(id)?.available ||
      readings.get(countryById.get(id)?.economicId)?.available,
    );
  const tooltip = document.createElement("div");
  tooltip.id = "globe-country-tooltip";
  tooltip.className = "globe-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.hidden = true;
  const tooltipSurface = document.createElement("div");
  tooltipSurface.className = "globe-tooltip-surface";
  tooltipSurface.dataset.state = "closed";
  tooltip.append(tooltipSurface);
  document.body.append(tooltip);
  const closeTooltip = () => {
    pointer = null;
    hover = null;
    tooltipPinned = false;
    tooltip.setAttribute("aria-hidden", "true");
    canvas.removeAttribute("aria-describedby");
    tooltipSurface.dataset.state = "closed";
    delete tooltipSurface.dataset.available;
    canvas.style.cursor = "grab";
  };
  listen(tooltipSurface, "animationend", () => {
    if (tooltipSurface.dataset.state === "closed") tooltip.hidden = true;
  });
  const showTooltip = (id) => {
    if (!pointer || !id) return;
    hover = id;
    tooltipSurface.textContent = countryById.get(id)?.name || id;
    tooltipSurface.dataset.available = String(available(id));
    tooltip.hidden = false;
    tooltip.setAttribute("aria-hidden", "false");
    canvas.setAttribute("aria-describedby", tooltip.id);
    tooltipSurface.dataset.state = "open";
    const tooltipWidth = tooltipSurface.offsetWidth;
    const tooltipHeight = tooltipSurface.offsetHeight;
    const x = Math.max(
      12,
      Math.min(
        innerWidth - tooltipWidth - 12,
        pointer.clientX - tooltipWidth / 2,
      ),
    );
    const top = pointer.clientY - tooltipHeight - 8;
    tooltip.dataset.side = top >= 12 ? "top" : "bottom";
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${top >= 12 ? top : pointer.clientY + 8}px`;
    tooltip.style.setProperty("--tooltip-anchor", `${pointer.clientX - x}px`);
  };
  const updateHover = () => {
    if (!pointer || tooltipPinned) return;
    const id = hit(pointer);
    canvas.style.cursor = id ? "pointer" : "grab";
    if (!id) {
      hover = null;
      tooltip.setAttribute("aria-hidden", "true");
      canvas.removeAttribute("aria-describedby");
      tooltipSurface.dataset.state = "closed";
      delete tooltipSurface.dataset.available;
      return;
    }
    showTooltip(id);
  };
  // Coordinates are resolved once, so rendering and hit testing do not scan
  // or repeatedly convert the full catalog roster on every animation frame.
  const pins = [...countryById.values()]
    .filter(({ lon, lat }) => Number.isFinite(lon) && Number.isFinite(lat))
    .map((country) => ({
      ...country,
      vector: sphere([country.lon, country.lat]),
    }));
  let cosYaw, sinYaw, cosPitch, sinPitch;
  const orient = () => {
    cosYaw = Math.cos(yaw);
    sinYaw = Math.sin(yaw);
    cosPitch = Math.cos(pitch);
    sinPitch = Math.sin(pitch);
  };
  const project = ([x, y, z], output = [0, 0, 0]) => {
    const rx = x * cosYaw - z * sinYaw;
    const rz = x * sinYaw + z * cosYaw;
    const ry = y * cosPitch - rz * sinPitch;
    const depth = y * sinPitch + rz * cosPitch;
    output[0] = width / 2 + rx * radius;
    output[1] = height / 2 - ry * radius;
    output[2] = depth;
    return output;
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
  // Spherical clipping reconnects rim crossings along the horizon, not chords.
  // This also handles rings surrounding a pole and antimeridian crossings.
  const projection = geoOrthographic().clipAngle(90).precision(0.4);
  const landPath = geoPath(projection, context);
  const projectedPoint = [0, 0, 0];
  let glow, ocean;
  const grid = [];
  for (let lat = -60; lat <= 60; lat += 30)
    grid.push(Array.from({ length: 121 }, (_, i) => sphere([i * 3, lat])));
  for (let lon = 0; lon < 360; lon += 30)
    grid.push(Array.from({ length: 61 }, (_, i) => sphere([lon, -90 + i * 3])));
  function draw() {
    if (!width || destroyed) return;
    if (surfaceDirty) updateSurface();
    orient();
    context.clearRect(0, 0, width, height);
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    context.beginPath();
    context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    context.fillStyle = ocean;
    context.fill();
    context.strokeStyle = "rgba(207,185,125,.3)";
    context.stroke();
    context.save();
    context.clip();
    projection.rotate([-yaw / radians, -pitch / radians]);
    for (const points of grid) stroke(points, "rgba(207,185,125,.11)");
    for (const country of outlines) {
      // A conservative spherical cap rejects wholly hidden land before the
      // more expensive polygon stream; polar and wide caps remain unclipped here.
      if (country.cap && project(country.cap.center)[2] < -country.cap.sine)
        continue;
      const emphasized = country.id === selected || country.id === hover;
      const hasData = available(country.id);
      context.beginPath();
      if (country.cap && project(country.cap.center)[2] > country.cap.sine) {
        // Entirely front-facing caps need no spherical clipping. Use cached
        // unit vectors; only silhouettes and polar crossings take the D3 path.
        for (const ring of country.vectors) {
          let first = true;
          for (const vector of ring) {
            const [x, y] = project(vector, projectedPoint);
            if (first) context.moveTo(x, y);
            else context.lineTo(x, y);
            first = false;
          }
          context.closePath();
        }
      } else landPath(country.geometry);
      context.fillStyle = hasData
        ? "rgba(207,185,125,.3)"
        : "rgba(183,181,169,.09)";
      context.fill("evenodd");
      context.strokeStyle = emphasized
        ? "rgba(253,229,182,.95)"
        : hasData
          ? "rgba(207,185,125,.7)"
          : "rgba(183,181,169,.28)";
      context.lineWidth = emphasized ? 1.5 : 0.8;
      context.stroke();
    }
    for (const country of pins) {
      const [x, y, z] = project(country.vector);
      if (z < 0.04) continue;
      const emphasized = country.id === selected || country.id === hover;
      const hasData = available(country.id);
      context.beginPath();
      context.arc(x, y, emphasized ? 2.2 : 0.9, 0, Math.PI * 2);
      context.fillStyle = hasData
        ? emphasized
          ? "#fde5b6"
          : "#cfb97d"
        : emphasized
          ? "#d8d7d1"
          : "#77756e";
      context.fill();
      if (emphasized) {
        context.beginPath();
        context.arc(x, y, 4.5, 0, Math.PI * 2);
        context.strokeStyle = hasData
          ? "rgba(253,229,182,.55)"
          : "rgba(216,215,209,.45)";
        context.lineWidth = 0.55;
        context.stroke();
      }
    }
    context.restore();
  }
  function animate(time) {
    frame = undefined;
    if (destroyed || !visible || document.hidden) return;
    if (dirty || time - last >= (destination ? 16 : 33)) {
      dirty = false;
      if (destination) {
        const delta = Math.atan2(
          Math.sin(destination.yaw - yaw),
          Math.cos(destination.yaw - yaw),
        );
        const latitude = destination.pitch - pitch;
        yaw += delta * 0.065;
        pitch += latitude * 0.065;
        if (Math.abs(delta) + Math.abs(latitude) < 0.002) destination = null;
      } else if (!start && !reduced.matches)
        yaw += (Math.min(time - last, 100) * 0.000035) / zoom;
      updateHover();
      draw();
      last = time;
    }
    if (!start && (!reduced.matches || destination))
      frame = requestAnimationFrame(animate);
  }
  const restart = () => {
    cancelAnimationFrame(frame);
    last = performance.now();
    if (visible && !document.hidden) draw();
    if (visible && !document.hidden && !reduced.matches && !start)
      frame = requestAnimationFrame(animate);
  };
  const requestDraw = () => {
    dirty = true;
    if (!frame && visible && !document.hidden)
      frame = requestAnimationFrame(animate);
  };
  const release = () => {
    if (!start) return;
    start = null;
    dragging = false;
    restart();
  };
  function select(id) {
    const country = countryById.get(id);
    if (!country) return;
    selected = id;
    destination =
      Number.isFinite(country.lon) && Number.isFinite(country.lat)
        ? { yaw: country.lon * radians, pitch: country.lat * radians }
        : null;
    if (!destination) {
      restart();
      return;
    }
    if (reduced.matches) {
      yaw = destination.yaw;
      pitch = destination.pitch;
      destination = null;
    }
    restart();
  }
  function hit(event) {
    if (surfaceDirty) updateSurface();
    orient();
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left,
      y = event.clientY - bounds.top;
    let near,
      distance = event.pointerType === "touch" ? 22 : 10;
    for (const country of pins) {
      const [cx, cy, z] = project(country.vector);
      const delta = Math.hypot(cx - x, cy - y);
      if (z >= 0.04 && delta < distance) {
        distance = delta;
        near = country.id;
      }
    }
    // Only the visible marker itself outranks a land boundary. Enlarged island
    // targets apply over water, never over an adjacent country's territory.
    if (near && distance <= 2.5) return near;
    // Invert the front hemisphere so the full country area, not only its pin, responds.
    const sx = (x - width / 2) / radius,
      sy = -(y - height / 2) / radius;
    if (sx * sx + sy * sy > 1) return;
    const depth = Math.sqrt(1 - sx * sx - sy * sy);
    const ry = sy * Math.cos(pitch) + depth * Math.sin(pitch);
    const rz = depth * Math.cos(pitch) - sy * Math.sin(pitch);
    const lon = (Math.atan2(sx, rz) + yaw) / radians;
    const point = [((lon + 540) % 360) - 180, Math.asin(ry) / radians];
    const inside = ({ points: ring, minX, maxX, minY, maxY }) => {
      const px =
        point[0] + 360 * Math.round(((minX + maxX) / 2 - point[0]) / 360);
      if (px < minX || px > maxX || point[1] < minY || point[1] > maxY)
        return false;
      let result = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i],
          [bx, by] = ring[j];
        if (
          ay > point[1] !== by > point[1] &&
          px < ((bx - ax) * (point[1] - ay)) / (by - ay) + ax
        )
          result = !result;
      }
      return result;
    };
    return (
      outlines.find((country) =>
        country.pickPolygons.some(
          ([outer, ...holes]) => inside(outer) && !holes.some(inside),
        ),
      )?.id || near
    );
  }
  listen(canvas, "pointerdown", (event) => {
    if (event.pointerType === "touch") {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
        dragging = true;
        closeTooltip();
        return;
      }
    }
    if (!event.isPrimary || event.button !== 0) return;
    closeTooltip();
    start = {
      x: event.clientX,
      y: event.clientY,
      yaw,
      pitch,
      pointerType: event.pointerType,
    };
    dragging = false;
    destination = null;
    canvas.setPointerCapture(event.pointerId);
    cancelAnimationFrame(frame);
    frame = undefined;
  });
  listen(canvas, "pointermove", (event) => {
    if (touches.has(event.pointerId))
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch) {
      const [a, b] = [...touches.values()];
      if (a && b && pinch.distance)
        setZoom(
          (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance,
        );
      return;
    }
    if (start) {
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) > 6) {
        dragging = true;
      }
      if (dragging) {
        yaw = start.yaw - (dx * 0.006) / zoom;
        pitch = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, start.pitch + (dy * 0.006) / zoom),
        );
        requestDraw();
      }
    } else {
      if (event.pointerType === "touch") return;
      pointer = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
      };
      tooltipPinned = false;
      updateHover();
      requestDraw();
    }
  });
  listen(canvas, "pointerup", (event) => {
    touches.delete(event.pointerId);
    if (pinch) {
      if (!touches.size) {
        pinch = null;
        release();
      }
      return;
    }
    if (
      start &&
      !dragging &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
    ) {
      const id = hit({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType || start.pointerType,
      });
      if (id) {
        select(id);
        onSelect(id, countryById.get(id));
        pointer = {
          clientX: event.clientX,
          clientY: event.clientY,
          pointerType: event.pointerType || start.pointerType,
        };
        tooltipPinned = true;
        canvas.style.cursor = "pointer";
        showTooltip(id);
      }
    }
    release();
  });
  listen(canvas, "pointercancel", () => {
    touches.clear();
    pinch = null;
    closeTooltip();
    release();
  });
  listen(canvas, "lostpointercapture", (event) => {
    touches.delete(event.pointerId);
    if (!touches.size) {
      pinch = null;
      release();
    }
  });
  listen(window, "blur", () => {
    touches.clear();
    pinch = null;
    closeTooltip();
    release();
  });
  listen(canvas, "pointerleave", (event) => {
    // Touch has no hover: its automatic pointerleave must not hide a tap label.
    if (event.pointerType === "touch" && tooltipPinned) return;
    closeTooltip();
    requestDraw();
  });
  listen(document, "pointerdown", (event) => {
    if (event.target !== canvas) closeTooltip();
  });
  listen(canvas, "keydown", (event) => {
    closeTooltip();
    if (["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault();
      setZoom(
        event.key === "0" ? 1 : zoom * (event.key === "-" ? 1 / 1.25 : 1.25),
      );
      return;
    }
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
    const index = countryList.findIndex(({ id }) => id === selected);
    const next =
      countryList[
        event.key === "Home"
          ? 0
          : (index +
              (event.key === "ArrowRight" ? 1 : -1) +
              countryList.length) %
            countryList.length
      ];
    if (next) {
      select(next.id);
      onSelect(next.id, countryById.get(next.id));
    }
  });
  function setZoom(value) {
    const next = Math.max(1, Math.min(6, value));
    if (next === zoom) return;
    zoom = next;
    canvas.dataset.zoom = zoom.toFixed(2);
    surfaceDirty = true;
    closeTooltip();
    requestDraw();
  }
  listen(
    canvas,
    "wheel",
    (event) => {
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      if (!delta) return;
      event.preventDefault();
      setZoom(zoom * Math.exp(-Math.max(-150, Math.min(150, delta)) * 0.002));
    },
    { passive: false },
  );
  function updateSurface() {
    surfaceDirty = false;
    radius = Math.min(width, height) * 0.43 * zoom;
    projection.scale(radius).translate([width / 2, height / 2]);
    // Rebuild only at resolution boundaries, not on each wheel/pinch frame.
    const resolution =
      Math.min(width, height) * 0.43 * 2 ** Math.ceil(Math.log2(zoom));
    if (geometryRadius !== resolution)
      for (const country of outlines) {
        country.geometry = displayGeometry(country.polygons, resolution);
        country.vectors = country.geometry.coordinates
          .flat(1)
          .map((ring) => ring.map(sphere));
        const vectors = country.vectors.flat();
        const sum = vectors.reduce(
          (sum, p) => sum.map((v, i) => v + p[i]),
          [0, 0, 0],
        );
        const length = Math.hypot(...sum);
        const center = sum.map((v) => v / length);
        const cosine = Math.min(
          ...vectors.map((p) =>
            p.reduce((dot, v, i) => dot + v * center[i], 0),
          ),
        );
        country.cap =
          length && cosine > 0
            ? { center, sine: Math.sqrt(1 - cosine * cosine) }
            : null;
      }
    geometryRadius = resolution;
    glow = context.createRadialGradient(
      width / 2,
      height / 2,
      radius * 0.6,
      width / 2,
      height / 2,
      radius * 1.25,
    );
    glow.addColorStop(0, "rgba(207,185,125,.08)");
    glow.addColorStop(1, "rgba(207,185,125,0)");
    ocean = context.createRadialGradient(
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
  }
  const resize = new ResizeObserver(() => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    updateSurface();
    draw();
  });
  resize.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    restart();
  });
  intersection.observe(canvas);
  listen(document, "visibilitychange", () => {
    closeTooltip();
    restart();
  });
  listen(window, "scroll", closeTooltip);
  listen(reduced, "change", restart);
  return {
    select,
    setReadings(updated) {
      readings = updated;
      draw();
    },
    destroy() {
      destroyed = true;
      closeTooltip();
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      tooltip.remove();
      listeners.forEach((remove) => remove());
    },
  };
}
