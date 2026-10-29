/** The page's element of `id`. */
export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing workbench element: ${id}`);
  return found as T;
}

/** Set a button's state and its accessible text. */
export function labelled(button: HTMLButtonElement, disabled: boolean, title: string) {
  button.disabled = disabled;
  button.title = title;
}

/** A new element with text and attributes. */
export function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  attributes: Readonly<Record<string, string>> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}
