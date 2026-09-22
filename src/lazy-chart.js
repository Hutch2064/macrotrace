// Keep the first screen immediate; prepare offscreen plots before they scroll
// into view. The original data and all inspection points remain available.
export function lazyChart(host, create) {
  let chart,
    observer,
    idle,
    destroyed = false;
  const visible = () => {
    const box = host.getBoundingClientRect();
    return (
      host.isConnected &&
      box.width > 0 &&
      box.top < innerHeight + 600 &&
      box.bottom > -600
    );
  };
  const draw = () => {
    if (destroyed || chart || !host.isConnected) return;
    observer?.disconnect();
    chart = create();
  };
  if (visible()) draw();
  else {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) draw();
      },
      { rootMargin: "600px" },
    );
    observer.observe(host);
    if ("requestIdleCallback" in window)
      idle = requestIdleCallback(() => {
        if (visible()) draw();
      });
  }
  return {
    host,
    reset() {
      draw();
      chart?.reset?.();
    },
    resize() {
      if (visible()) draw();
      chart?.resize?.();
    },
    destroy() {
      destroyed = true;
      observer?.disconnect();
      if (idle !== undefined) cancelIdleCallback(idle);
      chart?.destroy();
    },
  };
}
