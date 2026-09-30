// Shared accessible listbox: animate both directions, including interrupted motion.
let active;
export function labelFields(root = document) {
  for (const label of root.querySelectorAll("label")) {
    if (!label.querySelector("select, input[type=search], input[type=date]"))
      continue;
    for (const node of [...label.childNodes]) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim())
        continue;
      const header = document.createElement("span");
      header.className = "field-label";
      header.textContent = node.textContent.trim();
      node.replaceWith(header);
    }
  }
}
globalThis.document?.addEventListener("click", (event) => {
  if (
    active &&
    !event.composedPath?.().includes(active.wrapper) &&
    !event.composedPath?.().includes(active.menu) &&
    !active.wrapper.contains(event.target) &&
    !active.menu.contains(event.target)
  )
    active.close();
});
export function enhanceSelect(select, onPreview) {
  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";
  // The enclosing label must not forward this click to the hidden native select.
  wrapper.addEventListener("click", (event) => {
    if (!event.target.closest?.(".select-search-input")) event.preventDefault();
  });
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute(
    "aria-label",
    select.getAttribute("aria-label") ||
      select.closest("label")?.textContent.trim() ||
      "Select an option",
  );
  const menu = document.createElement("div");
  menu.className = "select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  const dialog = document.createElement("dialog");
  dialog.className = "select-dialog";
  dialog.setAttribute("aria-label", trigger.getAttribute("aria-label"));
  document.body.append(dialog);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
    trigger.focus();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  let motion, scaleMotion;
  const searchable = select.dataset?.searchable === "true";
  let query = "";
  let searchInput;
  let optionsHost = menu;
  if (searchable) {
    const searchWrap = document.createElement("div");
    searchWrap.className = "select-search";
    searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "select-search-input";
    searchInput.placeholder =
      select.dataset.searchPlaceholder || "Search options…";
    searchInput.setAttribute("aria-label", searchInput.placeholder);
    searchInput.setAttribute("autocomplete", "off");
    searchInput.setAttribute("spellcheck", "false");
    optionsHost = document.createElement("div");
    optionsHost.className = "select-options";
    searchWrap.append(searchInput);
    menu.append(searchWrap, optionsHost);
  }
  const render = () => {
    const label = document.createElement("span");
    label.textContent = select.selectedOptions[0]?.textContent || "Select";
    const arrow = document.createElement("i");
    arrow.setAttribute("aria-hidden", "true");
    trigger.replaceChildren(label, arrow);
    const options = [...select.options].filter((option) => !option.disabled);
    const matches = searchable
      ? options.filter(
          (option) =>
            option.value === "all" ||
            !query ||
            option.textContent.toLocaleLowerCase().includes(query),
        )
      : options;
    const optionButtons = matches.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(option.selected));
      button.dataset.value = option.value;
      button.textContent = option.textContent;
      return button;
    });
    optionsHost.replaceChildren(...optionButtons);
    if (
      searchable &&
      query &&
      !options.some(
        (option) => option.value !== "all" && matches.includes(option),
      )
    ) {
      const noResults = document.createElement("p");
      noResults.className = "select-no-results";
      noResults.setAttribute("role", "status");
      noResults.setAttribute("aria-live", "polite");
      noResults.textContent = `No geographies match “${query}”.`;
      optionsHost.append(noResults);
    }
  };
  const resetSearch = () => {
    query = "";
    if (searchInput) searchInput.value = "";
    render();
  };
  if (searchInput)
    searchInput.addEventListener("input", () => {
      query = searchInput.value.trim().toLocaleLowerCase();
      render();
    });
  const transition = (open) => {
    const wasHidden = menu.hidden;
    const opacity = wasHidden ? 0 : Number(getComputedStyle(menu).opacity);
    const transform = wasHidden ? "scale(0)" : getComputedStyle(menu).transform;
    motion?.cancel();
    scaleMotion?.cancel();
    menu.hidden = false;
    menu.inert = !open;
    trigger.setAttribute("aria-expanded", String(open));
    wrapper.classList.toggle("open", open);
    const mobile = matchMedia("(max-width: 700px)").matches;
    if (open && mobile && !dialog.open) {
      dialog.append(menu);
      dialog.showModal();
    }
    if (open && !mobile && menu.parentNode !== wrapper) wrapper.append(menu);
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 300;
    if (mobile)
      scaleMotion = menu.animate(
        [{ transform }, { transform: open ? "scale(1)" : "scale(0)" }],
        { duration, easing: "cubic-bezier(0.215, 0.61, 0.355, 1)" },
      );
    motion = menu.animate([{ opacity }, { opacity: open ? 1 : 0 }], {
      duration,
      easing: mobile
        ? "cubic-bezier(0.25, 0.1, 0.25, 1)"
        : "cubic-bezier(0, 0, 0.58, 1)",
    });
    motion.onfinish = () => {
      menu.hidden = !open;
      if (!open && dialog.open) {
        dialog.close();
        wrapper.append(menu);
        trigger.focus({ preventScroll: true });
      }
    };
  };
  const close = () => {
    if (trigger.getAttribute("aria-expanded") === "true") transition(false);
    resetSearch();
    if (active?.wrapper === wrapper) active = null;
  };
  const open = () => {
    if (active?.wrapper !== wrapper) active?.close();
    resetSearch();
    active = { wrapper, menu, close };
    transition(true);
    if (searchInput) searchInput.focus({ preventScroll: true });
    else
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
  const keydown = (event) => {
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
    if (event.target === searchInput && ["Home", "End"].includes(event.key))
      return;
    let options = [...menu.querySelectorAll("[role=option]")];
    if (searchable && query && options.length > 1) options = options.slice(1);
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
  };
  wrapper.addEventListener("keydown", keydown);
  dialog.addEventListener("keydown", keydown);
  select.hidden = true;
  select.after(wrapper);
  wrapper.append(trigger, menu);
  select._renderCustom = render;
  select._resetCustomSearch = resetSearch;
  render();
  return wrapper;
}
