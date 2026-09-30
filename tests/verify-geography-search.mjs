import assert from "node:assert/strict";

class MockEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(listener);
    this.listeners.set(type, callbacks);
  }

  dispatchEvent(event) {
    if (!event.target) {
      try {
        event.target = this;
      } catch {
        // Native Event.target is read-only; this dispatch does not need it.
      }
    }
    for (const listener of this.listeners.get(event.type) || [])
      listener.call(this, event);
    return true;
  }
}

class MockElement extends MockEventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.inert = false;
    this.open = false;
    this._text = "";
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const shouldHave = force ?? !this.classList.contains(name);
        this.className = this.className
          .split(/\s+/)
          .filter(Boolean)
          .filter((item) => item !== name)
          .concat(shouldHave ? [name] : [])
          .join(" ");
        return shouldHave;
      },
    };
  }

  set textContent(value) {
    this._text = String(value ?? "");
    this.children = [];
  }

  get textContent() {
    return (
      this._text || this.children.map((child) => child.textContent).join("")
    );
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "class") this.className = String(value);
    if (name === "role") this.role = String(value);
    if (name.startsWith("data-")) this.dataset[name.slice(5)] = String(value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  append(...children) {
    for (const child of children) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
    }
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }

  contains(node) {
    return this === node || this.children.some((child) => child.contains(node));
  }

  matches(selector) {
    if (selector === ".select-search-input")
      return this.classList.contains("select-search-input");
    if (selector === "[data-value]") return this.dataset.value !== undefined;
    const dataValue = selector.match(/^\[data-value="([^"]+)"\]$/);
    if (dataValue) return this.dataset.value === dataValue[1];
    if (selector === "[role=option]") return this.role === "option";
    if (selector === "[role=status]") return this.role === "status";
    if (selector === '[aria-selected="true"]')
      return this.getAttribute("aria-selected") === "true";
    return false;
  }

  closest(selector) {
    const selectors = selector.split(",").map((item) => item.trim());
    let node = this;
    while (node) {
      if (selectors.some((item) => node.matches(item))) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  focus() {
    globalThis.document.activeElement = this;
  }

  animate() {
    return { cancel() {}, onfinish: null };
  }
}

class MockDocument extends MockEventTarget {
  constructor() {
    super();
    this.body = new MockElement("body");
    this.activeElement = this.body;
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }
}

const document = new MockDocument();
globalThis.document = document;
globalThis.getComputedStyle = () => ({ opacity: "1", transform: "none" });
globalThis.matchMedia = () => ({ matches: false });

const { enhanceSelect } = await import("../src/select.js");

class MockOption {
  constructor(value, text, selected = false) {
    this.value = value;
    this.textContent = text;
    this.selected = selected;
    this.disabled = false;
  }
}

function mockSelect(options, searchable = true) {
  const select = new MockElement("select");
  select.dataset = searchable
    ? {
        searchable: "true",
        searchPlaceholder: "Search geographies…",
      }
    : {};
  select.options = options;
  Object.defineProperty(select, "selectedOptions", {
    get: () => options.filter((option) => option.selected),
  });
  Object.defineProperty(select, "value", {
    get: () => options.find((option) => option.selected)?.value || "",
    set: (value) =>
      options.forEach((option) => (option.selected = option.value === value)),
  });
  select.getAttribute = (name) => (name === "aria-label" ? "Geography" : null);
  select.closest = () => ({ textContent: "Geography" });
  select.after = (wrapper) => document.body.append(wrapper);
  return select;
}

const options = [
  new MockOption("all", "All geographies", true),
  new MockOption("Canada", "Canada"),
  new MockOption("Europe", "Europe"),
  new MockOption("United States", "United States"),
];
const select = mockSelect(options);
const wrapper = enhanceSelect(select);
const trigger = wrapper.children[0];
const menu = wrapper.children[1];
const search = menu.querySelector(".select-search-input");

assert.equal(search.placeholder, "Search geographies…");
assert.equal(search.getAttribute("aria-label"), "Search geographies…");
assert.deepEqual(
  menu.querySelectorAll("[role=option]").map((option) => option.textContent),
  ["All geographies", "Canada", "Europe", "United States"],
);

trigger.dispatchEvent({ type: "click", target: trigger });
assert.equal(
  document.activeElement,
  search,
  "Opening focuses the geography search",
);
search.value = "euro";
search.dispatchEvent({ type: "input", target: search });
assert.deepEqual(
  menu.querySelectorAll("[role=option]").map((option) => option.textContent),
  ["All geographies", "Europe"],
);

wrapper.dispatchEvent({
  type: "keydown",
  target: search,
  key: "ArrowDown",
  preventDefault() {},
  stopPropagation() {},
});
assert.equal(
  document.activeElement.textContent,
  "Europe",
  "ArrowDown focuses the first filtered geography, not the reset option",
);

const europe = menu.querySelector('[data-value="Europe"]');
menu.dispatchEvent({ type: "click", target: europe });
assert.equal(select.value, "Europe");
assert.equal(search.value, "", "Selecting a result clears the query");
assert.equal(
  menu.querySelectorAll("[role=option]").length,
  4,
  "Closing restores all geography options",
);

trigger.dispatchEvent({ type: "click", target: trigger });
document.dispatchEvent({
  type: "click",
  target: { parentNode: null },
  composedPath: () => [trigger, wrapper, document],
});
assert.equal(
  trigger.getAttribute("aria-expanded"),
  "true",
  "Re-rendering the clicked trigger label cannot turn its click into an outside click",
);
search.value = "does-not-exist";
search.dispatchEvent({ type: "input", target: search });
const noResults = menu.querySelector("[role=status]");
assert.ok(noResults);
assert.match(noResults.textContent, /No geographies match/);

wrapper.dispatchEvent({
  type: "keydown",
  target: search,
  key: "Escape",
  preventDefault() {},
  stopPropagation() {},
});
assert.equal(search.value, "", "Escape clears the query");
assert.equal(trigger.getAttribute("aria-expanded"), "false");

trigger.dispatchEvent({ type: "click", target: trigger });
search.value = "can";
search.dispatchEvent({ type: "input", target: search });
trigger.dispatchEvent({ type: "click", target: trigger });
assert.equal(search.value, "", "Closing without selecting clears the query");

const ordinary = mockSelect(
  [new MockOption("all", "All topics", true), new MockOption("rates", "Rates")],
  false,
);
const ordinaryWrapper = enhanceSelect(ordinary);
assert.equal(
  ordinaryWrapper.querySelector(".select-search-input"),
  null,
  "Only the Geography select gets a search input",
);

console.log(
  "Verified searchable Geography filtering, reset behavior, keyboard navigation, no-results accessibility, and ordinary-select preservation.",
);
