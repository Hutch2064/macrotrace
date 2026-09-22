const DISCLOSURE_DURATION = 300;

const transitionStates = new WeakMap();
const internallyToggled = new WeakMap();
let panelCounter = 0;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const findPanel = (detail) =>
  Array.from(detail.children).find((child) =>
    child.classList.contains("disclosure-panel"),
  );

const setNativeOpen = (detail, open) => {
  if (detail.open === open) return;
  internallyToggled.set(detail, (internallyToggled.get(detail) || 0) + 1);
  detail.open = open;
};

const setAriaState = (detail, open) => {
  detail
    .querySelector(":scope > summary")
    ?.setAttribute("aria-expanded", String(open));
};

const clearTransition = (detail, resolve = true) => {
  const state = transitionStates.get(detail);
  if (!state) return;
  if (state.raf !== null) window.cancelAnimationFrame(state.raf);
  window.clearTimeout(state.timer);
  state.panel.removeEventListener("transitionend", state.onEnd);
  transitionStates.delete(detail);
  if (resolve) state.resolve();
};

const finishTransition = (detail, open) => {
  const state = transitionStates.get(detail);
  if (state) {
    state.panel.removeEventListener("transitionend", state.onEnd);
    window.clearTimeout(state.timer);
    transitionStates.delete(detail);
  }
  const panel = findPanel(detail);
  if (!panel) return;
  detail.dataset.disclosureState = open ? "open" : "closed";
  setNativeOpen(detail, open);
  panel.style.height = open ? "auto" : "0px";
  panel.style.opacity = open ? "1" : "0";
  setAriaState(detail, open);
  state?.resolve();
};

const prepareDisclosure = (detail) => {
  if (detail.dataset.disclosureReady === "true") return findPanel(detail);
  const summary = detail.querySelector(":scope > summary");
  const panel = findPanel(detail);
  if (!summary || !panel) return null;

  detail.dataset.disclosureReady = "true";
  detail.dataset.disclosureState = detail.open ? "open" : "closed";
  if (!panel.id) panel.id = `disclosure-panel-${++panelCounter}`;
  summary.setAttribute("aria-controls", panel.id);
  setAriaState(detail, detail.open);
  panel.style.height = detail.open ? "auto" : "0px";
  panel.style.opacity = detail.open ? "1" : "0";

  summary.addEventListener("click", (event) => {
    if (event.target.closest("a, button, input, select, textarea")) return;
    event.preventDefault();
    event.stopPropagation();
    const current = transitionStates.get(detail);
    const nextOpen = current ? !current.target : !detail.open;
    transitionDisclosure(detail, nextOpen);
  });
  summary.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    transitionDisclosure(detail, false);
  });
  detail.addEventListener("toggle", () => {
    const internalCount = internallyToggled.get(detail) || 0;
    if (internalCount) {
      if (internalCount === 1) internallyToggled.delete(detail);
      else internallyToggled.set(detail, internalCount - 1);
      return;
    }
    const current = transitionStates.get(detail);
    if (current?.target === detail.open) return;
    const desiredOpen = detail.open;
    if (!desiredOpen) setNativeOpen(detail, true);
    transitionDisclosure(detail, desiredOpen);
  });
  return panel;
};

export const transitionDisclosure = (detail, open) => {
  const panel = prepareDisclosure(detail);
  if (!panel) return Promise.resolve();
  const current = transitionStates.get(detail);
  if (current?.target === open) return current.promise;
  if (current) clearTransition(detail);

  if (prefersReducedMotion()) {
    setNativeOpen(detail, open);
    finishTransition(detail, open);
    return Promise.resolve();
  }

  const wasOpen = detail.open;
  if (open) setNativeOpen(detail, true);
  const currentHeight = wasOpen ? panel.getBoundingClientRect().height : 0;
  detail.dataset.disclosureState = open ? "opening" : "closing";
  const targetHeight = open ? panel.scrollHeight : 0;
  panel.style.height = `${currentHeight}px`;
  panel.style.opacity = open ? (currentHeight ? "1" : "0") : "1";
  setAriaState(detail, open);

  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  const state = {
    target: open,
    panel,
    raf: null,
    timer: 0,
    promise,
    resolve: resolvePromise,
    onEnd: (event) => {
      if (event.target === panel && event.propertyName === "height") {
        finishTransition(detail, open);
      }
    },
  };
  transitionStates.set(detail, state);
  panel.addEventListener("transitionend", state.onEnd);
  state.timer = window.setTimeout(
    () => finishTransition(detail, open),
    DISCLOSURE_DURATION + 40,
  );
  state.raf = window.requestAnimationFrame(() => {
    panel.style.height = `${targetHeight}px`;
    panel.style.opacity = open ? "1" : "0";
  });
  return promise;
};

export const openDisclosure = (detail) => transitionDisclosure(detail, true);

export const closeDisclosure = (detail) => transitionDisclosure(detail, false);

export const initDisclosure = (root = document) => {
  const details = [];
  if (root instanceof HTMLDetailsElement) details.push(root);
  else details.push(...root.querySelectorAll("details"));
  details.forEach((detail) => {
    detail.classList.add("disclosure");
    prepareDisclosure(detail);
  });
};
