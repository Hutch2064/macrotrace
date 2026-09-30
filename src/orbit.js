// Original, lightweight 3D illustration: mathematical geometry, not economic data.
export function economicOrbit(canvas) {
  const context = canvas.getContext("2d");
  if (!context) return { destroy() {} };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0,
    height = 0,
    yaw = -0.5,
    pitch = -0.2,
    frame,
    visible = true;
  let last = 0,
    dragging = false,
    pointer,
    destroyed = false;
  const nodes = [
    { name: "INFLATION", angle: -0.8, elevation: 0.35 },
    { name: "EMPLOYMENT", angle: 0.45, elevation: 0.52 },
    { name: "GROWTH", angle: 1.45, elevation: -0.3 },
    { name: "POLICY", angle: 2.6, elevation: 0.1 },
    { name: "HOUSING", angle: 3.8, elevation: -0.45 },
    { name: "COMMODITIES", angle: 4.7, elevation: 0.25 },
  ];
  const project = ([x, y, z]) => {
    const rotatedX = x * Math.cos(yaw) + z * Math.sin(yaw);
    const rotatedZ = z * Math.cos(yaw) - x * Math.sin(yaw);
    const rotatedY = y * Math.cos(pitch) - rotatedZ * Math.sin(pitch);
    const depth = y * Math.sin(pitch) + rotatedZ * Math.cos(pitch);
    const scale = (Math.min(width * 0.3, height * 0.34) * 3.8) / (3.8 - depth);
    return [width / 2 + rotatedX * scale, height / 2 + rotatedY * scale, depth];
  };
  const sphere = (angle, latitude, radius = 1) => [
    Math.cos(latitude) * Math.cos(angle) * radius,
    Math.sin(latitude) * radius,
    Math.cos(latitude) * Math.sin(angle) * radius,
  ];
  function line(points, opacity = 0.2, thickness = 0.65) {
    for (let i = 1; i < points.length; i++) {
      const previous = project(points[i - 1]),
        current = project(points[i]);
      context.beginPath();
      context.moveTo(previous[0], previous[1]);
      context.lineTo(current[0], current[1]);
      context.strokeStyle = `rgba(207,185,125,${opacity * (0.3 + (current[2] + 1.6) / 3.5)})`;
      context.lineWidth = thickness;
      context.stroke();
    }
  }
  function draw() {
    if (!width || !height || destroyed) return;
    context.clearRect(0, 0, width, height);
    const glow = context.createRadialGradient(
      width / 2,
      height / 2,
      5,
      width / 2,
      height / 2,
      Math.min(width, height) * 0.43,
    );
    glow.addColorStop(0, "rgba(207,185,125,.06)");
    glow.addColorStop(1, "rgba(207,185,125,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    for (let latitude = -1.2; latitude < 1.3; latitude += 0.24)
      line(
        Array.from({ length: 65 }, (_, i) =>
          sphere((i / 64) * Math.PI * 2, latitude),
        ),
        0.18,
      );
    for (let longitude = 0; longitude < Math.PI * 2; longitude += Math.PI / 10)
      line(
        Array.from({ length: 41 }, (_, i) =>
          sphere(longitude, -Math.PI / 2 + (i / 40) * Math.PI),
        ),
        0.16,
      );
    for (const tilt of [-0.55, 0.55]) {
      const points = Array.from({ length: 100 }, (_, i) => {
        const angle = (i / 99) * Math.PI * 2;
        return [
          Math.cos(angle) * 1.38,
          Math.sin(angle) * Math.sin(tilt) * 1.38,
          Math.sin(angle) * Math.cos(tilt) * 1.38,
        ];
      });
      line(points, 0.35, 0.9);
    }
    // Fine points make the geometry legible without a heavy WebGL dependency.
    for (let latitude = -0.95; latitude < 1; latitude += 0.32)
      for (let angle = 0; angle < Math.PI * 2; angle += 0.37) {
        const [x, y, z] = project(sphere(angle, latitude));
        context.fillStyle = `rgba(245,218,150,${0.12 + (z + 1) * 0.15})`;
        context.fillRect(x, y, z > 0 ? 1.5 : 1, z > 0 ? 1.5 : 1);
      }
    const projectedNodes = nodes
      .map((node) => ({
        ...node,
        point: project(sphere(node.angle, node.elevation, 1.35)),
      }))
      .sort((a, b) => a.point[2] - b.point[2]);
    projectedNodes.forEach((node) => {
      const [x, y, z] = node.point;
      context.beginPath();
      context.arc(x, y, 3.1, 0, Math.PI * 2);
      context.fillStyle = z > 0 ? "#F5DA96" : "#806126";
      context.fill();
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.strokeStyle = "rgba(207,185,125,.25)";
      context.stroke();
      context.font = `500 ${width < 450 ? 8 : 10}px "Geist Mono"`;
      const left = x < width / 2;
      const labelWidth = context.measureText(node.name).width;
      const labelX = left
        ? Math.max(labelWidth + 8, x - 13)
        : Math.min(width - labelWidth - 8, x + 13);
      context.textAlign = left ? "right" : "left";
      context.fillStyle = z > 0 ? "#b7b5a9" : "#77766f";
      context.fillText(node.name, labelX, y + 3);
    });
  }
  function animate(time) {
    frame = undefined;
    if (destroyed || !visible || document.hidden || reduced.matches) return;
    if (time - last > 32) {
      if (!dragging) yaw += 0.0017;
      draw();
      last = time;
    }
    frame = requestAnimationFrame(animate);
  }
  const restart = () => {
    cancelAnimationFrame(frame);
    frame = undefined;
    draw();
    if (visible && !document.hidden && !reduced.matches)
      frame = requestAnimationFrame(animate);
  };
  const resize = new ResizeObserver(() => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
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
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    pointer = [event.clientX, event.clientY];
  });
  const move = (event) => {
    if (!dragging) return;
    yaw += (event.clientX - pointer[0]) * 0.008;
    pitch = Math.max(
      -0.8,
      Math.min(0.8, pitch + (event.clientY - pointer[1]) * 0.004),
    );
    pointer = [event.clientX, event.clientY];
    draw();
  };
  canvas.addEventListener("pointermove", move);
  const release = () => {
    dragging = false;
  };
  window.addEventListener("pointerup", release);
  canvas.addEventListener("pointerleave", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("keydown", (event) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    if (event.key === "ArrowLeft") yaw -= 0.12;
    if (event.key === "ArrowRight") yaw += 0.12;
    if (event.key === "ArrowUp") pitch = Math.max(-0.8, pitch - 0.08);
    if (event.key === "ArrowDown") pitch = Math.min(0.8, pitch + 0.08);
    draw();
  });
  reduced.addEventListener("change", restart);
  document.addEventListener("visibilitychange", restart);
  document.fonts.ready.then(() => {
    if (!destroyed) draw();
  });
  restart();
  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", restart);
      reduced.removeEventListener("change", restart);
      window.removeEventListener("pointerup", release);
    },
  };
}
