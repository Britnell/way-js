export function evaluateExpression(expression: string, data: any) {
  try {
    return new Function('data', `with(data) { return ${expression} }`)(data);
  } catch (e) {
    console.error(`Error evaluating expression: "${expression}"`, e);
    return null;
  }
}

export function getInputValue(inputEl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): any {
  if (inputEl instanceof HTMLInputElement) {
    if (inputEl.type === 'checkbox') {
      return inputEl.checked;
    } else if (inputEl.type === 'radio') {
      return inputEl.checked ? inputEl.value : null;
    } else if (inputEl.type === 'number') {
      return inputEl.value === '' ? null : Number(inputEl.value);
    } else {
      return inputEl.value;
    }
  } else {
    return inputEl.value;
  }
}

export function setInputValue(inputEl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: any): void {
  if (inputEl instanceof HTMLInputElement) {
    if (inputEl.type === 'checkbox') {
      inputEl.checked = Boolean(value);
      return;
    } else if (inputEl.type === 'radio') {
      inputEl.checked = inputEl.value === String(value);
      return;
    }
  }
  inputEl.value = String(value ?? '');
}

export class FrameworkComponent extends HTMLElement {
  template: HTMLTemplateElement;
  _data: any;

  constructor(template: HTMLTemplateElement) {
    super();
    this.template = template;
  }

  connectedCallback() {
    const content = this.template.content.cloneNode(true);
    this.appendChild(content);
  }

  disconnectedCallback() {
    if (this._data.onDisconnected) {
      this._data.onDisconnected();
    }
  }
}

export function createWebComponent(tag: string, template: HTMLTemplateElement) {
  class WebComponent extends FrameworkComponent {
    constructor() {
      super(template);
    }
  }
  customElements.define(tag, WebComponent);
}

export function createMarker(template: HTMLTemplateElement, text: string): Comment {
  const nextSibling = template.nextSibling;
  if (nextSibling instanceof Comment && nextSibling.nodeValue === text) {
    return nextSibling;
  }
  const marker = document.createComment(text);
  template.parentNode?.insertBefore(marker, template.nextSibling);
  return marker;
}

export function findElseTemplate(template: HTMLTemplateElement): HTMLTemplateElement | null {
  const nextElement = template.nextElementSibling;
  return nextElement instanceof HTMLTemplateElement && nextElement.hasAttribute('x-else') ? nextElement : null;
}

export function hasContentAfter(template: HTMLTemplateElement, markerText: string): boolean {
  const nextSibling = template.nextSibling;
  return nextSibling instanceof Comment && nextSibling.nodeValue === markerText ? false : nextSibling !== null;
}

export function removeNodesUntil(start: Element | null, markerText: string) {
  if (!start) return;

  let current = start.nextSibling;
  while (current && !(current instanceof Comment && current.nodeValue === markerText)) {
    const next = current.nextSibling;
    current.parentNode?.removeChild(current);
    current = next;
  }
}

export function parseForExpression(expression: string): [string, string | null, string] {
  const withIndex = expression.match(/^\((\w+),\s*(\w+)\)\s+in\s+(.+)$/);
  if (withIndex) {
    return [withIndex[1], withIndex[2], withIndex[3].trim()];
  }

  const withoutIndex = expression.match(/^(\w+)\s+in\s+(.+)$/);
  if (!withoutIndex) {
    throw new Error(`Invalid x-for expression: "${expression}"`);
  }

  return [withoutIndex[1], null, withoutIndex[2].trim()];
}
