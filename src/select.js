// Shared accessible listbox: animate both directions, including interrupted motion.
let active;
globalThis.document?.addEventListener("click", (event) => {
  if (active && !active.wrapper.contains(event.target)) active.close();
});
export function enhanceSelect(select, onPreview) {
  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute(
    "aria-label",
    select.getAttribute("aria-label") ||
      (select.id === "horizon-filter" ? "Horizon" : "Explore a collection"),
  );
  const menu = document.createElement("div");
  menu.className = "select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  let motion;
  const render = () => {
    const label = document.createElement("span");
    label.textContent = select.selectedOptions[0]?.textContent || "Select";
    const arrow = document.createElement("i");
    arrow.setAttribute("aria-hidden", "true");
    trigger.replaceChildren(label, arrow);
    menu.replaceChildren(
      ...[...select.options]
        .filter((option) => !option.disabled)
        .map((option) => {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", String(option.selected));
          button.dataset.value = option.value;
          button.textContent = option.textContent;
          return button;
        }),
    );
  };
  const transition = (open) => {
    const from = menu.hidden ? 0 : menu.getBoundingClientRect().height;
    motion?.cancel();
    menu.hidden = false;
    menu.inert = !open;
    trigger.setAttribute("aria-expanded", String(open));
    wrapper.classList.toggle("open", open);
    const height = Math.min(menu.scrollHeight, 320, innerHeight / 2);
    motion = menu.animate(
      [
        { height: `${from}px`, opacity: open ? 0 : 1 },
        { height: `${open ? height : 0}px`, opacity: open ? 1 : 0 },
      ],
      {
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 300,
        easing: "ease-out",
      },
    );
    motion.onfinish = () => {
      menu.hidden = !open;
    };
  };
  const close = () => {
    if (trigger.getAttribute("aria-expanded") === "true") transition(false);
    if (active?.wrapper === wrapper) active = null;
  };
  const open = () => {
    if (active?.wrapper !== wrapper) active?.close();
    active = { wrapper, close };
    transition(true);
    menu
      .querySelector('[aria-selected="true"]')
      ?.focus({ preventScroll: true });
  };
  trigger.addEventListener("click", () =>
    trigger.getAttribute("aria-expanded") === "true" ? close() : open(),
  );
  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      open();
    }
  });
  menu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-value]");
    if (!option) return;
    select.value = option.dataset.value;
    select.dispatchEvent(new Event("change"));
    render();
    close();
    trigger.focus({ preventScroll: true });
  });
  menu.addEventListener("pointerover", (event) =>
    onPreview?.(event.target.closest("[data-value]")?.dataset.value),
  );
  wrapper.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      trigger.getAttribute("aria-expanded") === "true"
    ) {
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.focus();
    }
    if (event.key === "Tab") close();
    if (!menu.contains(event.target)) return;
    const options = [...menu.querySelectorAll("[role=option]")];
    const index = options.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      options[
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
              options.length
      ]?.focus();
    }
  });
  select.hidden = true;
  select.after(wrapper);
  wrapper.append(trigger, menu);
  select._renderCustom = render;
  render();
  return wrapper;
}
