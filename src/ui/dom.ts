/**
 * The attributes and children accepted when creating an element.
 */
export interface IElementOptions {
  /**
   * The class attribute of the element.
   */
  className?: string;
  /**
   * The text content of the element.
   */
  text?: string;
  /**
   * Additional attributes to set.
   */
  attributes?: Record<string, string>;
  /**
   * Child nodes to append.
   */
  children?: Node[];
}

/**
 * Create an element, with everything set up in one call.
 *
 * @param tag The tag name of the element.
 * @param options The attributes and children of the element.
 * @returns The created element.
 */
export function element<TTag extends keyof HTMLElementTagNameMap>(
  tag: TTag,
  options: IElementOptions = {},
): HTMLElementTagNameMap[TTag] {
  const created = document.createElement(tag);
  if (options.className) {
    created.className = options.className;
  }
  if (options.text !== undefined) {
    created.textContent = options.text;
  }
  for (const [ name, value ] of Object.entries(options.attributes ?? {})) {
    created.setAttribute(name, value);
  }
  for (const child of options.children ?? []) {
    created.append(child);
  }
  return created;
}

/**
 * Look up an element by id, failing loudly when the markup and code disagree.
 *
 * @param id The id of the element.
 * @returns The element.
 */
export function requireElement<TElement extends HTMLElement>(id: string): TElement {
  const found = document.querySelector(`#${id}`);
  if (!found) {
    throw new Error(`Missing element with id '${id}'`);
  }
  return <TElement> found;
}
