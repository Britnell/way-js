declare global {
  interface Element {
    _data?: any;
  }
}

import { signal, effect } from '@preact/signals-core';

const components: Record<string, any> = {};
const validationSchemas: Record<string, any> = {};
const stores: Record<string, any> = {};

const directives: Record<string, (el: Element, expression: string, data: any) => void> = {
  'x-text': (el, expression, data) => {
    effect(() => {
      el.textContent = evaluateExpression(expression, data);
    });
  },
  'x-show': (el, expression, data) => {
    effect(() => {
      const shouldShow = evaluateExpression(expression, data);
      (el as HTMLElement).style.display = shouldShow ? '' : 'none';

      // x-else
      const nextEl = el.nextElementSibling;
      if (nextEl?.hasAttribute('x-else')) {
        (nextEl as HTMLElement).style.display = shouldShow ? 'none' : '';
      }
    });
  },
  'x-model': (el, expression, data) => {
    const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const field = objectGet(data, expression);
    if (!isSignal(field)) {
      console.error(`[x-model] Expression "${expression}" does not resolve to a signal. x-model requires a signal.`);
      return;
    }

    // Set initial value after next tick to fix select element timing issue
    setTimeout(() => {
      setInputValue(inputEl, field.value);
    }, 0);

    effect(() => {
      setInputValue(inputEl, field.value);
    });

    inputEl.addEventListener('input', () => {
      field.value = getInputValue(inputEl);
    });
  },
  'x-form': formDirective,
  'x-if': ifDirective,
  'x-for': forLoopDirective,
  'x-load': (el, _expression, _data) => {
    (el as HTMLElement).style.display = 'block';
  },
  'x-temp': (el, expression, _data) => {
    const templateId = expression;
    const template = document.getElementById(templateId) as HTMLTemplateElement;

    if (!template) {
      console.error(`Template with id "${templateId}" not found.`);
      return;
    }

    const slotFragment = document.createDocumentFragment();
    while (el.firstChild) {
      slotFragment.appendChild(el.firstChild);
    }

    const templateContent = template.content.cloneNode(true) as DocumentFragment;
    const slot = templateContent.querySelector('slot');

    if (slot) {
      slot.replaceWith(slotFragment);
    }

    el.appendChild(templateContent);
  },
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

  const startMarker = document.createComment(` x-for: ${expression} `);
  container.insertBefore(startMarker, templateEl);

  effect(() => {
    const rawResult = evaluateExpression(arrayExpr, data);
    // Then unwrap the result for actual use
    const unwrappedArray = isSignal(rawResult) ? rawResult.value : rawResult;
    // Clear all previously rendered nodes
    while (startMarker.nextSibling && startMarker.nextSibling !== templateEl) {
      container.removeChild(startMarker.nextSibling);
    }

    if (Array.isArray(unwrappedArray)) {
      for (let index = 0; index < unwrappedArray.length; index++) {
        const item = unwrappedArray[index];
        const itemScope = createItemContext(data, itemVar, indexVar, item, index);

        const fragment = templateEl.content.cloneNode(true) as DocumentFragment;
        for (const node of Array.from(fragment.childNodes)) {
          if (node instanceof Element) {
            hydrate(node, itemScope);
          } else if (node instanceof Text) {
            hydrateBindings(node, itemScope);
          }
        }
        container.insertBefore(fragment, templateEl);
      }
    }
  });
}

function ifDirective(templateEl: Element, expression: string, data: any) {
  if (!(templateEl instanceof HTMLTemplateElement)) {
    console.error('x-if directive must be used on a <template> element.');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.display = 'contents';
  templateEl.parentNode!.insertBefore(wrapper, templateEl);

  const chain: { template: HTMLTemplateElement; expression: string | null }[] = [];
  chain.push({ template: templateEl as HTMLTemplateElement, expression });

  let nextEl = templateEl.nextElementSibling;
  while (nextEl) {
    if (nextEl instanceof HTMLTemplateElement && nextEl.hasAttribute('x-else-if')) {
      chain.push({ template: nextEl, expression: nextEl.getAttribute('x-else-if')! });
    } else if (nextEl instanceof HTMLTemplateElement && nextEl.hasAttribute('x-else')) {
      chain.push({ template: nextEl, expression: null });
      break;
    } else {
      break;
    }
    nextEl = nextEl.nextElementSibling;
  }

  let lastActiveTemplate: HTMLTemplateElement | null = null;

  effect(() => {
    let activeTemplate: HTMLTemplateElement | null = null;

    for (const { template, expression } of chain) {
      if (expression === null || evaluateExpression(expression, data)) {
        activeTemplate = template;
        break;
      }
    }

    if (activeTemplate === lastActiveTemplate) {
      return;
    }

    wrapper.innerHTML = '';

    if (activeTemplate) {
      const fragment = activeTemplate.content.cloneNode(true) as DocumentFragment;
      const children = Array.from(fragment.children);

      for (const child of children) {
        if (child instanceof Element) {
          hydrate(child, data);
        }
      }

      wrapper.append(fragment);
    }

    lastActiveTemplate = activeTemplate;
  });
}

//  * Hydration

async function render(root: Element, initial?: any) {
  document.dispatchEvent(new CustomEvent('way:init'));
  await waitForWebComponents(Object.keys(components));

  hydrate(root, initial);
}

function hydrate(root: Element = document.body, initialContext = {}) {
  const contextWithStores = { ...stores, ...initialContext };
  traverseDOM(root, contextWithStores, (node, ctx) => {
    let newContext = { ...ctx };

    if (node instanceof Element) {
      // x-data
      newContext = hydrateData(node, newContext);

      // components
      const componentContext = hydrateWebComponent(node, newContext);
      if (componentContext !== newContext) {
        newContext = componentContext;
      }
    }

    // bindings (handles both elements and text nodes)
    hydrateBindings(node, newContext);

    return newContext;
  });
}

function hydrateData(element: Element, context: any): any {
  const dataAttr = element.getAttribute('x-data');
  if (!dataAttr) return context;

  let elementData: any = {};

  // Check if it's an inline object (starts with {)
  if (dataAttr.includes('{')) {
    try {
      const rawObject = evaluateExpression(dataAttr, {});
      elementData = makeObjectReactive(rawObject);
    } catch (e) {
      console.error(`Failed to evaluate x-data "${dataAttr}" as inline object`, e);
      return context;
    }
  } else {
    // Handle comma-separated component names or single component
    const componentNames = dataAttr.split(',').map((name) => name.trim());

    for (const componentName of componentNames) {
      if (components[componentName]) {
        const emit = createEmit(element);
        const componentData = components[componentName]({}, { emit });
        elementData = { ...elementData, ...componentData };
      } else {
        console.warn(`Component "${componentName}" not found in x-data "${dataAttr}"`);
      }
    }
  }

  element._data = elementData;

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

function hydrateBindings(node: Element | Text, context: any): void {
  if (node instanceof Text) {
    bindTextInterpolation(node, context);
    return;
  }

  // Only process directives and attributes on Elements
  // x-text, x-show, x-model ...
  Object.keys(directives).forEach((dir) => {
    if (node.hasAttribute(dir)) {
      const expression = node.getAttribute(dir);
      // For directives like x-load that don't require an expression
      if (expression || dir === 'x-load') {
        directives[dir](node, expression || '', context);
      }
    }
  });

  // @events, :properties
  const specialAttrs = Array.from(node.attributes).filter(
    (attr) => attr.name.startsWith('@') || attr.name.startsWith(':'),
  );
  specialAttrs.forEach((attr) => {
    const expression = attr.value;
    if (!expression) return;

    if (attr.name.startsWith('@')) {
      const eventName = attr.name.substring(1);
      bindEvent(node, eventName, expression, context);
    } else if (attr.name.startsWith(':')) {
      const propName = attr.name.substring(1);
      bindProperty(node, propName, expression, context);
    }
  });
}

function bindTextInterpolation(node: Text, context: any) {
  const txt = node.textContent;
  if (!txt?.trim() || !txt.includes('{')) {
    return;
  }

  const parts = txt.split(/(\{[^}]+\})/g);

  effect(() => {
    node.textContent = parts
      .map((part) => {
        if (part.startsWith('{') && part.endsWith('}')) {
          const expression = part.slice(1, -1);
          const value = evaluateExpression(expression, context);
          return value === null || value === undefined ? '' : String(value);
        }
        return part;
      })
      .join('');
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

const eventModifiers: Record<string, (element: Element, event: Event) => boolean | void> = {
  prevent: (_element, event) => {
    event.preventDefault();
  },
  stop: (_element, event) => {
    event.stopPropagation();
  },
  outside: (element, event) => {
    if (!event.target) return true;
    if (element.contains(event.target as Node)) {
      return true; // Skip execution if click is inside
    }
  },
  self: (element, event) => {
    if (event.target !== element) {
      return true; // Skip execution if target is not the element itself
    }
  },
};

function parseEventModifiers(eventName: string): { event: string; modifiers: string[] } {
  const parts = eventName.split('.');
  return {
    event: parts[0],
    modifiers: parts.slice(1),
  };
}

function bindEvent(element: Element, eventName: string, expression: string, context: any) {
  const { event: baseEvent, modifiers } = parseEventModifiers(eventName);

  // Find emit function from nearest web component parent
  const findEmit = (el: Element): ((eventName: string, ...args: any[]) => void) | null => {
    if (el?._data) {
      return createEmit(el);
    }
    return el.parentElement ? findEmit(el.parentElement) : null;
  };

  const emit = findEmit(element);

  const handler = (event: Event) => {
    // Apply modifiers
    for (const modifier of modifiers) {
      const modifierFn = eventModifiers[modifier];
      if (modifierFn) {
        const shouldSkip = modifierFn(element, event);
        if (shouldSkip === true) {
          return; // Skip execution if modifier returns true
        }
      }
    }

    const eventContext = {
      ...context,
      $event: event,
      emit,
    };
    evaluateExpression(expression, eventContext);
  };

  const options = modifiers.includes('once') ? { once: true } : {};
  element.addEventListener(baseEvent, handler, options);
}

function store(name: string, setup: () => any) {
  stores[name] = setup();
}

function form(name: string, fields: any, onSubmit?: (event: Event, values: Record<string, string>) => void) {
  // Store the fields and onSubmit handler separately
  validationSchemas[name] = {
    fields,
    onSubmit,
  };
}

function comp<T = any>(
  tag: string,
  setup?: (props: T, context: { emit: (eventName: string, arg?: any) => void }) => any,
) {
  components[tag] = setup || ((props: T, _context: any) => props);
  const template = document.getElementById(tag) as HTMLTemplateElement;
  if (tag.includes('-') && template) {
    createWebComponent(tag, template);
  }
}

function isSignal(val: any): boolean {
  return !!(val && typeof val === 'object' && typeof val.peek === 'function');
}

function makeObjectReactive(obj: any): any {
  if (typeof obj !== 'object' || obj === null || isSignal(obj)) {
    return obj;
  }

  const reactive: any = {};

  Object.keys(obj).forEach((key) => {
    const value = obj[key];

    if (isSignal(value)) {
      reactive[key] = value;
    } else if (typeof value === 'function') {
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

const way = { comp, render, form, signal, effect, store };

declare global {
  interface Window {
    pageprops?: any;
    way: {
      comp: typeof comp;
      render: typeof render;
      form: typeof form;
      signal: typeof signal;
      effect: typeof effect;
      store: typeof store;
    };
  }
}

if (typeof window !== 'undefined') {
  window.way = way;
}
export default way;

//  *** helpers

function objectGet(obj: any, path: string): any {
  const keys = path.split('.');
  let field = obj;
  for (const key of keys) {
    field = field[key];
  }
  return field;
}

function evaluateExpression(expression: string, data: any) {
  try {
    return new Function('data', `with(data) { return (${expression}) }`)(data);
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

class wayComponent extends HTMLElement {
  template: HTMLTemplateElement;
  _data: any;

  constructor(template: HTMLTemplateElement) {
    super();
    this.template = template;
  }

  connectedCallback() {
    const slotFragment = document.createDocumentFragment();
    while (this.firstChild) {
      slotFragment.appendChild(this.firstChild);
    }

    const content = this.template.content.cloneNode(true) as DocumentFragment;
    const slot = content.querySelector('slot');

    if (slot) {
      slot.replaceWith(slotFragment);
    }

    this.appendChild(content);

    if (this._data?.onMounted) {
      this._data.onMounted();
    }
  }

  disconnectedCallback() {
    if (this._data?.onUnmounted) {
      this._data.onUnmounted();
    }
  }
}

function createWebComponent(tag: string, template: HTMLTemplateElement) {
  class WebComponent extends wayComponent {
    constructor() {
      super(template);
    }
  }
  customElements.define(tag, WebComponent);
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

function traverseDOM(
  root: Element,
  initialContext: any = {},
  callback: (node: Element | Text, context: any) => any,
): void {
  function traverseNode(node: Element | Text, currentContext: any): void {
    if (node instanceof Element) {
      const dontparse = ['SCRIPT', 'STYLE'].includes(node.tagName);
      const componentTemplate = node.tagName === 'TEMPLATE' && node.id;
      if (dontparse || componentTemplate) {
        return;
      }

      const newContext = callback(node, currentContext);

      const childNodes = Array.from(node.childNodes);
      for (const child of childNodes) {
        traverseNode(child as Element | Text, newContext);
      }
    } else if (node instanceof Text) {
      callback(node, currentContext);
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
