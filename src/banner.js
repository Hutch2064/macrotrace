// Recycle a bounded window; every series still participates in the full cycle.
export function mountBanner(host, rows, markup) {
  const track = host.querySelector(".tape-track");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let entries = rows,
    cursor = 0,
    animation;
  const group = () => {
    const element = document.createElement("div");
    element.className = "tape-group";
    const count = reduced.matches
      ? entries.length
      : Math.min(12, entries.length);
    element.innerHTML = Array.from({ length: count }, () =>
      markup(entries[cursor++ % entries.length]),
    ).join("");
    return element;
  };
  const pause = () => {
    if (document.hidden || host.matches(":hover, :focus-within"))
      animation?.pause();
    else animation?.play();
  };
  const run = () => {
    animation?.cancel();
    if (reduced.matches || !entries.length) return;
    const width = track.firstElementChild.getBoundingClientRect().width;
    animation = track.animate(
      [
        { transform: "translateX(0)" },
        { transform: `translateX(-${width}px)` },
      ],
      {
        duration: (width / 45) * 1000,
        easing: "linear",
        fill: "forwards",
      },
    );
    animation.onfinish = () => {
      track.firstElementChild.remove();
      track.append(group());
      run();
    };
    pause();
  };
  const update = (next) => {
    entries = next;
    cursor = 0;
    animation?.cancel();
    track.replaceChildren();
    if (entries.length) track.append(group());
    if (!reduced.matches && entries.length) track.append(group());
    requestAnimationFrame(run);
  };
  for (const event of ["pointerenter", "pointerleave", "focusin", "focusout"])
    host.addEventListener(event, () => requestAnimationFrame(pause));
  document.addEventListener("visibilitychange", pause);
  reduced.addEventListener("change", () => update(entries));
  document.fonts.ready.then(run);
  update(rows);
  return update;
}
