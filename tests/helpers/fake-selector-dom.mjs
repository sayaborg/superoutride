/** Minimal DOM for selector ownership tests; rendering is checked in the browser separately. */
export class SelectorElement {
  children = [];
  listeners = new Map();
  attributes = new Map();
  textContent = '';
  className = '';
  classList = {
    values: new Set(),
    toggle(value, force) {
      const active = force ?? !this.values.has(value);
      if (active) this.values.add(value);
      else this.values.delete(value);
      return active;
    },
    contains(value) {
      return this.values.has(value);
    },
    add(...values) {
      for (const value of values) this.values.add(value);
    },
    remove(...values) {
      for (const value of values) this.values.delete(value);
    },
  };
  style = { setProperty() {} };
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  addEventListener(name, fn) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(fn);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, fn) {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter((listener) => listener !== fn),
    );
  }
  replaceChildren(...children) {
    this.children = children;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  emit(name, event = {}) {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
  click() {
    this.emit('click');
  }
}
export const selectorDocument = { createElement: (tag) => new SelectorElement(tag) };
