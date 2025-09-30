declare global {
  interface Element {
    _data?: any;
  }
}

import { signal, effect } from '@preact/signals-core';

const components: Record<string, any> = {};
const validationSchemas: Record<string, any> = {};

const directives: Record<string, (el: Element, expression: string, data: any) => void> = {
  'x-text': (el, expression, data) => {
    effect(() => {
      const value = evaluateExpression(expression, data);
      el.textContent = value;
    });
  },
  'x-show': (el, expression, data) => {
    effect(() => {
      const value = evaluateExpression(expression, data);
      const shouldShow = value;

      // x-show
      (el as HTMLElement).style.display = shouldShow ? '' : 'none';

      // x-else
      const nextElement = el.nextElementSibling;
      if (nextElement && nextElement.hasAttribute('x-else')) {
        const shouldShowElse = !shouldShow;
        (nextElement as HTMLElement).style.display = shouldShowElse ? '' : 'none';
      }
    });
  },
  'x-model': (el, expression, data) => {
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

    effect(() => {
      const value = evaluateExpression(expression, data);
      setInputValue(inputEl, value);
    });

    inputEl.addEventListener('input', () => {
      const newValue = getInputValue(inputEl);
      if (data[expression]?.value !== undefined) {
        data[expression].value = newValue;
      } else {
        data[expression] = newValue;
      }
    });
  },
  'x-form': formDirective,
  'x-if': ifDirective,
  'x-for': forLoopDirective,
};

function formDirective(el: Element, expression: string, _data: any) {
  if (!(el instanceof HTMLFormElement)) {
    console.error('x-form directive can only be used on form elements.');
    return;
  }

  const formEl = el as HTMLFormElement;
  const formName = expression;
  const formConfig = validationSchemas[formName];

  if (!formConfig) {
    console.error(`Form validation schema not found: "${formName}"`);
    return;
  }

  // Listen to form events (input, submit)
  formEl.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    validateField(target, formConfig);
  });

  formEl.addEventListener('submit', (event) => {
    const isValid = validateForm(formEl, formConfig);
    if (!isValid) {
      event.preventDefault();
      return;
    }

    if (formConfig.onSubmit) {
      const formData = new FormData(formEl);
      const formDataObj: Record<string, string> = {};
      formData.forEach((value, key) => {
        formDataObj[key] = value.toString();
      });
      formConfig.onSubmit(event, formDataObj);
    }
  });
}

function forLoopDirective(el: Element, expression: string, data: any) {
  if (!(el instanceof HTMLTemplateElement)) {
    console.error('x-for directive must be used on a <template> element.');
    return;
  }

  const templateEl = el;
  const container = templateEl.parentNode as HTMLElement;
  const [itemVar, indexVar, arrayExpr] = parseForExpression(expression);
  const keyAttr = templateEl.getAttribute(':key') || templateEl.getAttribute('x-key');

  const startMarker = document.createComment(` x-for: ${expression} `);
  container.insertBefore(startMarker, templateEl);

  let renderedItems = new Map<string, { nodes: Node[]; scope: any }>();

  const createAndHydrateNewItem = (itemScope: any): Node[] => {
    const fragment = templateEl.content.cloneNode(true) as DocumentFragment;
    const newNodes = Array.from(fragment.childNodes);
    for (const node of newNodes) {
      if (node instanceof Element) {
        hydrate(node, itemScope);
      }
    }
    return newNodes;
  };

  effect(() => {
    const array = evaluateExpression(arrayExpr, data);
    const oldRenderedItems = renderedItems;
    const newRenderedItems = new Map<string, { nodes: Node[]; scope: any }>();
    const newNodesOrdered: Node[] = [];

    if (Array.isArray(array)) {
      for (let index = 0; index < array.length; index++) {
        const item = array[index];
        const itemScope = createItemContext(data, itemVar, indexVar, item, index);
        const key = getItemKey(keyAttr, itemScope, index);

        const existingItem = oldRenderedItems.get(key);

        if (existingItem) {
          Object.assign(existingItem.scope, itemScope);
          newNodesOrdered.push(...existingItem.nodes);
          newRenderedItems.set(key, existingItem);
          oldRenderedItems.delete(key);
        } else {
          const newNodes = createAndHydrateNewItem(itemScope);
          newNodesOrdered.push(...newNodes);
          newRenderedItems.set(key, { nodes: newNodes, scope: itemScope });
        }
      }
    }

    // Remove nodes of items that are no longer in the list
    for (const { nodes } of oldRenderedItems.values()) {
      nodes.forEach((node) => {
        if (node.parentNode === container) container.removeChild(node);
      });
    }

    // Reconcile the DOM to match the new order
    let lastNode: Node = startMarker;
    for (const node of newNodesOrdered) {
      if (lastNode.nextSibling !== node) {
        container.insertBefore(node, lastNode.nextSibling);
      }
      lastNode = node;
    }

    // Remove any old nodes that are still lingering at the end of the list
    let nodeToRemove = lastNode.nextSibling;
    while (nodeToRemove && nodeToRemove !== templateEl) {
      const next = nodeToRemove.nextSibling;
      if (nodeToRemove.parentNode === container) {
        container.removeChild(nodeToRemove);
      }
      nodeToRemove = next;
    }

    renderedItems = newRenderedItems;
  });
}

function ifDirective(templateEl: Element, expression: string, data: any) {
  if (!(templateEl instanceof HTMLTemplateElement)) {
    console.error('x-if directive must be used on a <template> element.');
    return;
  }

  createMarker(templateEl, 'x-if');
  const elseTemplate = findElseTemplate(templateEl);
  if (elseTemplate) createMarker(elseTemplate, 'x-else');
  let lastState: boolean | null = null;

  const renderTemplate = (template: HTMLTemplateElement, data: any) => {
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const children = Array.from(fragment.children);

    for (const child of children) {
      template.parentElement?.insertBefore(child, template.nextSibling);
      if (child instanceof Element) {
        hydrate(child, data);
      }
    }
  };

  effect(() => {
    const shouldShow = evaluateExpression(expression, data);

    if (lastState === shouldShow) return;
    lastState = shouldShow;

    if (shouldShow) {
      removeNodesUntil(elseTemplate, 'x-else');
      if (!hasContentAfter(templateEl, 'x-if')) {
        renderTemplate(templateEl, data);
      }
    } else {
      removeNodesUntil(templateEl, 'x-if');
      if (elseTemplate && !hasContentAfter(elseTemplate, 'x-else')) {
        renderTemplate(elseTemplate, data);
      }
    }
  });
}

//  * Hydration

async function render(root: Element, initial?: any) {
  document.dispatchEvent(new CustomEvent('framework:init'));
  await waitForWebComponents(Object.keys(components));

  hydrate(root, initial);
}

function hydrate(root: Element = document.body, initialContext = {}) {
  traverseDOM(root, initialContext, (el, ctx) => {
    let newContext = { ...ctx };

    // x-data
    newContext = hydrateData(el, newContext);

    // components
    const componentContext = hydrateWebComponent(el, newContext);
    if (componentContext !== newContext) {
      newContext = componentContext;
    }

    // bindings
    hydrateBindings(el, newContext);

    return newContext;
  });
}

function hydrateData(element: Element, context: any): any {
  const dataAttr = element.getAttribute('x-data');
  if (!dataAttr) return context;

  if (components[dataAttr]) {
    element._data = components[dataAttr]();
  } else {
    try {
      const rawObject = evaluateExpression(dataAttr, {});
      const reactiveObject = makeObjectReactive(rawObject);
      element._data = reactiveObject;
    } catch (e) {
      console.error(`Failed to evaluate x-data "${dataAttr}" as inline object`, e);
      return context;
    }
  }

  // Return new context with this element's data added
  return { ...context, ...element._data };
}

function hydrateWebComponent(element: Element, context: any): any {
  if (!element.tagName.includes('-')) return context;

  const componentName = element.tagName.toLowerCase();
  if (!components[componentName] || element._data) return context;

  const props = parseProps(element, context);
  const emit = createEmit(element);
  element._data = components[componentName](props, { emit });

  return { ...context, ...element._data };
}

function hydrateBindings(element: Element, context: any): void {
  // x-text, x-show, x-model ...
  Object.keys(directives).forEach((dir) => {
    if (element.hasAttribute(dir)) {
      const expression = element.getAttribute(dir);
      if (expression) {
        directives[dir](element, expression, context);
      }
    }
  });

  // @events, :properties
  const specialAttrs = Array.from(element.attributes).filter(
    (attr) => attr.name.startsWith('@') || attr.name.startsWith(':'),
  );
  specialAttrs.forEach((attr) => {
    const expression = attr.value;
    if (!expression) return;

    if (attr.name.startsWith('@')) {
      const eventName = attr.name.substring(1);
      bindEvent(element, eventName, expression, context);
    } else if (attr.name.startsWith(':')) {
      const propName = attr.name.substring(1);
      bindProperty(element, propName, expression, context);
    }
  });
}

function bindProperty(element: Element, propName: string, expression: string, context: any) {
  effect(() => {
    const value = evaluateExpression(expression, context);

    if (propName === 'class') {
      // Handle class binding specially
      if (typeof value === 'string') {
        (element as HTMLElement).className = value;
      } else if (Array.isArray(value)) {
        (element as HTMLElement).className = value.join(' ');
      } else if (typeof value === 'object') {
        // Handle object format { active: true, disabled: false }
        const classes = Object.entries(value)
          .filter(([_, active]) => active)
          .map(([className]) => className)
          .join(' ');
        (element as HTMLElement).className = classes;
      }
    } else if (propName === 'style') {
      // Handle style binding
      if (typeof value === 'string') {
        (element as HTMLElement).style.cssText = value;
      } else if (typeof value === 'object') {
        // Handle object format { color: 'red', fontSize: '14px' }
        Object.entries(value).forEach(([key, val]) => {
          (element as HTMLElement).style.setProperty(key, String(val));
        });
      }
    } else {
      // Handle all other properties
      if (value === false || value === null || value === undefined) {
        element.removeAttribute(propName);
      } else {
        element.setAttribute(propName, String(value));
      }
    }
  });
}

function bindEvent(element: Element, eventName: string, expression: string, context: any) {
  // Find emit function from nearest web component parent
  const findEmit = (el: Element): ((eventName: string, ...args: any[]) => void) | null => {
    if (el?._data) {
      return createEmit(el);
    }
    return el.parentElement ? findEmit(el.parentElement) : null;
  };

  const emit = findEmit(element);

  element.addEventListener(eventName, (event: Event) => {
    const eventContext = {
      ...context,
      $event: event,
      emit,
    };
    evaluateExpression(expression, eventContext);
  });
}

function data(id: string, setup: any) {
  components[id] = setup;
}

function form(name: string, fields: any, onSubmit?: (event: Event, values: Record<string, string>) => void) {
  // Store the fields and onSubmit handler separately
  validationSchemas[name] = {
    fields,
    onSubmit,
  };
}

function component<T = any>(tag: string, setup: (props: T, context: { emit: (eventName: string, arg?: any) => void }) => any) {
  components[tag] = setup;
  const template = document.getElementById(tag) as HTMLTemplateElement;
  if (template) {
    createWebComponent(tag, template);
  }
}

function makeObjectReactive(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const reactive: any = {};

  Object.keys(obj).forEach((key) => {
    const value = obj[key];

    if (typeof value === 'function') {
      reactive[key] = value.bind(reactive);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively make nested objects reactive
      reactive[key] = makeObjectReactive(value);
    } else {
      // Wrap primitive values in signals
      reactive[key] = signal(value);
    }
  });

  return reactive;
}

function parseProps(el: Element, parentData: any) {
  const propsAttr = el.getAttribute('x-props');
  if (!propsAttr) return {};
  try {
    return evaluateExpression(propsAttr, parentData);
  } catch (e) {
    console.error('Error parsing props:', e);
    return {};
  }
}

function validateField(inputEl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, formConfig: any): void {
  const inputName = inputEl.name;
  if (!inputName) return;

  // Check if this field has a validation schema
  const { fields } = formConfig;
  if (!fields || !fields[inputName]) {
    // No validation schema for this field - clear any existing validation
    inputEl.setCustomValidity('');
    const errorId = inputEl.getAttribute('aria-describedby');
    if (errorId) {
      const errorEl = document.getElementById(errorId);
      if (errorEl) {
        errorEl.textContent = '';
      }
    }
    return;
  }

  // Validate just this field using Zod directly
  const result = fields[inputName].safeParse(inputEl.value);

  // Update the input element with validation state
  const errorId = inputEl.getAttribute('aria-describedby');
  let errorEl: HTMLElement | null = null;

  if (errorId) {
    errorEl = document.getElementById(errorId);
  }

  if (result.success) {
    inputEl.setCustomValidity('');
  } else {
    const firstError = result.error.issues[0]?.message || 'Invalid value';
    inputEl.setCustomValidity(firstError);
  }

  if (errorEl) {
    errorEl.textContent = inputEl.validationMessage;
  }
}

function validateForm(formEl: HTMLFormElement, formConfig: any): boolean {
  const formData = new FormData(formEl);
  const formDataObj: Record<string, string> = {};
  let allValid = true;

  // Convert FormData to object using input names
  formData.forEach((value, key) => {
    formDataObj[key] = value.toString();
  });

  // Validate each field individually
  formEl.querySelectorAll('input, textarea, select').forEach((input) => {
    const inputEl = input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    validateField(inputEl, formConfig);

    // Check if this field is valid
    if (!inputEl.checkValidity()) {
      allValid = false;
    }
  });

  return allValid;
}

const Framework = { data, component, render, form, signal, effect };

declare global {
  interface Window {
    pageprops?: any;
    Framework: {
      data: typeof data;
      component: typeof component;
      render: typeof render;
      form: typeof form;
      signal: typeof signal;
      effect: typeof effect;
    };
  }
}

if (typeof window !== 'undefined') {
  window.Framework = Framework;
}
export default Framework;

//  *** helpers

function evaluateExpression(expression: string, data: any) {
  try {
    return new Function('data', `with(data) { return ${expression} }`)(data);
  } catch (e) {
    console.error(`Error evaluating expression: "${expression}"`, e);
    return null;
  }
}

function getInputValue(inputEl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): any {
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

function setInputValue(inputEl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: any): void {
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

class FrameworkComponent extends HTMLElement {
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
    if (this._data.onUnmounted) {
      this._data.onUnmounted();
    }
  }
}

function createWebComponent(tag: string, template: HTMLTemplateElement) {
  class WebComponent extends FrameworkComponent {
    constructor() {
      super(template);
    }
  }
  customElements.define(tag, WebComponent);
}

function createMarker(template: HTMLTemplateElement, text: string): Comment {
  const nextSibling = template.nextSibling;
  if (nextSibling instanceof Comment && nextSibling.nodeValue === text) {
    return nextSibling;
  }
  const marker = document.createComment(text);
  template.parentNode?.insertBefore(marker, template.nextSibling);
  return marker;
}

function findElseTemplate(template: HTMLTemplateElement): HTMLTemplateElement | null {
  const nextElement = template.nextElementSibling;
  return nextElement instanceof HTMLTemplateElement && nextElement.hasAttribute('x-else') ? nextElement : null;
}

function hasContentAfter(template: HTMLTemplateElement, markerText: string): boolean {
  const nextSibling = template.nextSibling;
  return nextSibling instanceof Comment && nextSibling.nodeValue === markerText ? false : nextSibling !== null;
}

function removeNodesUntil(start: Element | null, markerText: string) {
  if (!start) return;

  let current = start.nextSibling;
  while (current && !(current instanceof Comment && current.nodeValue === markerText)) {
    const next = current.nextSibling;
    current.parentNode?.removeChild(current);
    current = next;
  }
}

function parseForExpression(expression: string): [string, string | null, string] {
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

function getItemKey(keyAttr: string | null, itemScope: any, index: number): string {
  return keyAttr ? String(evaluateExpression(keyAttr, itemScope)) : String(index);
}

function createItemContext(
  baseContext: any,
  itemVar: string,
  indexVar: string | null,
  itemValue: any,
  index: number,
): any {
  const context: any = {
    ...baseContext,
    [itemVar]: itemValue,
    $index: index,
  };

  if (indexVar) {
    context[indexVar] = index;
    context.index = index; // Also provide default 'index' for backward compatibility
  }

  return context;
}

function traverseDOM(root: Element, initialContext: any = {}, callback: (element: Element, context: any) => any): void {
  function traverseNode(element: Element, currentContext: any): void {
    const componentTempalte = element.tagName === 'TEMPLATE' && element.id;
    if (componentTempalte) return;

    const newContext = callback(element, currentContext);

    const children = Array.from(element.children);
    for (const child of children) {
      traverseNode(child, newContext);
    }
  }

  // Start traversal from the root element
  traverseNode(root, initialContext);
}

async function waitForWebComponents(names: string[]): Promise<void> {
  const potentialTags = names.filter((tag) => tag.includes('-'));
  if (potentialTags.length > 0) {
    const definitionPromises = potentialTags.map((tag) => customElements.whenDefined(tag).catch(() => null));
    await Promise.all(definitionPromises);
  }
}

function createEmit(component: Element) {
  return (eventName: string, arg: any) => {
    component.dispatchEvent(
      new CustomEvent(eventName, {
        detail: arg,
        bubbles: true,
      }),
    );
  };
}
