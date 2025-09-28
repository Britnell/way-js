declare global {
  interface Element {
    _data?: any;
  }
}

import { signal, effect } from '@preact/signals-core';

const components: Record<string, any> = {};
const validationSchemas: Record<string, any> = {};

function evaluate(expression: string, data: any) {
  try {
    return new Function('data', `with(data) { return ${expression} }`)(data);
  } catch (e) {
    console.error(`Error evaluating expression: "${expression}"`, e);
    return null;
  }
}

const directives: Record<string, (el: Element, expression: string, data: any) => void> = {
  'x-text': (el, expression, data) => {
    effect(() => {
      const value = evaluate(expression, data);
      el.textContent = value;
    });
  },
  'x-if': (el, expression, data) => {
    effect(() => {
      const value = evaluate(expression, data);
      const shouldShow = value;

      // x-if
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
      const value = evaluate(expression, data);
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
  'x-form': (el, expression, _data) => {
    if (!(el instanceof HTMLFormElement)) {
      console.warn('x-form directive can only be used on form elements.');
      return;
    }

    const formEl = el as HTMLFormElement;
    const formName = expression;
    const formConfig = validationSchemas[formName];

    if (!formConfig) {
      console.warn(`Form validation schema not found: "${formName}"`);
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
  },
  'x-for': (el: Element, expression: string, data: any) => {
    if (!(el instanceof HTMLTemplateElement)) {
      console.warn('x-for directive must be used on a <template> element.');
      return;
    }
    const templateEl = el;
    const [itemVar, indexVar, arrayExpr] = parseForExpression(expression);
    const container = templateEl.parentNode as HTMLElement;
    const keyAttr = templateEl.getAttribute(':key') || templateEl.getAttribute('x-key');

    let renderedItems = new Map<string, { nodes: Node[]; scope: any }>();

    effect(() => {
      const array = evaluate(arrayExpr, data);

      if (!Array.isArray(array)) {
        console.warn(`x-for expression "${arrayExpr}" did not evaluate to an array`);
        renderedItems.forEach(({ nodes }) => {
          nodes.forEach((node) => container.removeChild(node));
        });
        renderedItems.clear();
        return;
      }

      const newRenderedItems = new Map<string, { nodes: Node[]; scope: any }>();
      const newNodesOrdered: Node[] = [];

      for (let index = 0; index < array.length; index++) {
        const item = array[index];
        const itemScope = createItemContext(data, itemVar, indexVar, item, index);

        const key = keyAttr ? String(evaluate(keyAttr, itemScope)) : String(index);
        const currentItem = renderedItems.get(key);

        if (currentItem) {
          Object.assign(currentItem.scope, itemScope);
          newNodesOrdered.push(...currentItem.nodes);
          newRenderedItems.set(key, currentItem);
          renderedItems.delete(key);
        } else {
          const fragment = templateEl.content.cloneNode(true) as DocumentFragment;
          const tempWrapper = document.createElement('div');
          tempWrapper.appendChild(fragment);

          // Apply all directives with item scope as additional context
          bindDirectives(tempWrapper, itemScope);

          const newNodes = Array.from(tempWrapper.childNodes);
          newNodesOrdered.push(...newNodes);
          newRenderedItems.set(key, { nodes: newNodes, scope: itemScope });
        }
      }

      // Remove old items
      renderedItems.forEach(({ nodes }) => {
        nodes.forEach((node) => container.removeChild(node));
      });

      // Reorder existing nodes and insert new ones
      const referenceNode = templateEl;
      let currentInsertPosition: ChildNode | null = referenceNode;

      for (const node of newNodesOrdered) {
        if (node.parentNode !== container) {
          container.insertBefore(node, currentInsertPosition);
        }
        currentInsertPosition = node.nextSibling;
      }

      // Remove any remaining nodes that weren't in the new list
      let nextNode: ChildNode | null = currentInsertPosition;
      while (nextNode && nextNode !== templateEl) {
        const toRemove = nextNode;
        nextNode = nextNode.nextSibling;
        container.removeChild(toRemove);
      }

      renderedItems = newRenderedItems;
    });
  },
};

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

function bindProperty(element: Element, propName: string, expression: string, context: any) {
  effect(() => {
    const value = evaluate(expression, context);

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
    if (el instanceof Component && el._data) {
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
    evaluate(expression, eventContext);
  });
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

function collectContext(el: Element): any {
  const context: any = {};

  // Collect all parents with _data (closest last for proper precedence)
  const parents = [];
  let current = el.closest('[x-data], [x-props]');
  while (current) {
    if (current._data) {
      parents.push(current);
    }
    // Move to next parent up the tree
    current = current.parentElement?.closest('[x-data], [x-props]') || null;
  }

  // Merge parents (closest overwrites furthest)
  for (let i = parents.length - 1; i >= 0; i--) {
    Object.assign(context, parents[i]._data);
  }

  // Add current element's data if it's a web component (highest precedence)
  if (el instanceof Component && el._data) {
    Object.assign(context, el._data);
  }

  return context;
}

function processBuiltInDirectives(root: Element, additionalContext?: any) {
  Object.keys(directives).forEach((dir) => {
    const selector = `[${dir}]`;
    root.querySelectorAll(selector).forEach((element) => {
      const expression = element.getAttribute(dir);
      if (expression) {
        const context = collectContext(element);
        const finalContext = additionalContext ?? context;
        directives[dir](element, expression, finalContext);
      }
    });
  });
}

function processSpecialAttributes(root: Element, additionalContext?: any) {
  root.querySelectorAll('*').forEach((element) => {
    const specialAttrs = Array.from(element.attributes).filter(
      (attr) => attr.name.startsWith('@') || attr.name.startsWith(':'),
    );

    if (specialAttrs.length === 0) return;

    const context = collectContext(element);
    const finalContext = additionalContext ?? context;

    specialAttrs.forEach((attr) => {
      const expression = attr.value;
      if (!expression) return;

      if (attr.name.startsWith('@')) {
        const eventName = attr.name.substring(1);
        bindEvent(element, eventName, expression, finalContext);
      } else if (attr.name.startsWith(':')) {
        const propName = attr.name.substring(1);
        bindProperty(element, propName, expression, finalContext);
      }
    });
  });
}

function bindDirectives(el: Element, additionalContext?: any) {
  if (el.closest('template')) return;

  processBuiltInDirectives(el, additionalContext);
  processSpecialAttributes(el, additionalContext);
}

async function hydrateComponents(scope: Element) {
  // Get all potential web component tags from the components registry.
  const potentialTags = Object.keys(components).filter((tag) => tag.includes('-'));
  console.log(potentialTags);

  if (potentialTags.length === 0) return;

  // For each potential tag, check if it exists in the DOM.
  const tagsInDom = potentialTags.filter((tag) => scope.querySelector(tag));

  if (tagsInDom.length === 0) return;

  // Create whenDefined promises ONLY for tags that are actually in the DOM.
  const definitionPromises = tagsInDom.map((tag) => customElements.whenDefined(tag));

  console.log(' wait for comps');

  await Promise.all(definitionPromises);
  console.log(' hydr comps');

  // Now hydrate them.
  const selector = tagsInDom.join(',');
  scope.querySelectorAll(selector).forEach((el: Element) => {
    if (el instanceof Component && !el._data) {
      hydrateWebComponent(el as Component);
    }
  });
}

async function hydrate(el: Element) {
  console.log('hydr');

  const scope = el || document.body;

  // 1. x-data
  scope.querySelectorAll('[x-data]').forEach((el: Element) => {
    if (el.closest('template')) return;

    const dataAttr = el.getAttribute('x-data');
    if (dataAttr) {
      if (components[dataAttr]) {
        (el as any)._data = components[dataAttr]();
      } else {
        try {
          const rawObject = evaluate(dataAttr, {});
          const reactiveObject = makeObjectReactive(rawObject);
          (el as any)._data = reactiveObject;
        } catch (e) {
          console.warn(`Failed to evaluate x-data "${dataAttr}" as inline object`, e);
        }
      }
    }
  });

  // 2. Dispatch init event and wait for it to be processed
  // document.dispatchEvent(new CustomEvent('framework:init'));
  init();

  // Wait a tick to allow inline scripts to register components
  await new Promise((resolve) => setTimeout(resolve, 0));

  // 3. Hydrate all web components
  await hydrateComponents(scope);

  // 4. bind
  bindDirectives(scope);
}

function createEmit(component: Component) {
  return (eventName: string, arg: any) => {
    component.dispatchEvent(
      new CustomEvent(eventName, {
        detail: arg,
        bubbles: true,
      }),
    );
  };
}

function hydrateWebComponent(component: Component) {
  if (component._data) return; // Already hydrated

  const componentName = component.tagName.toLowerCase();
  const componentSetup = components[componentName];
  if (!componentSetup) return;

  // Collect parent context for props parsing
  const parentContext = collectContext(component.parentElement as Element);

  const props = parseProps(component.getAttribute('x-props') || '', parentContext);

  // Add emit function to props
  const emit = createEmit(component);

  component._data = componentSetup({ ...props, emit });
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

function component(tag: string, setup: any) {
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

function parseProps(propsAttr: string, parentData: any) {
  if (!propsAttr) return {};
  try {
    return evaluate(propsAttr, parentData);
  } catch (e) {
    console.warn('Error parsing props:', e);
    return {};
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

class Component extends HTMLElement {
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

function createWebComponent(tag: string, template: HTMLTemplateElement) {
  class WebComponent extends Component {
    constructor() {
      super(template);
    }
  }
  customElements.define(tag, WebComponent);
}

function init() {
  console.log('fr:init');

  document.dispatchEvent(new CustomEvent('framework:init'));
}

const Framework = { init, data, component, hydrate, form, signal, effect };

// Expose framework to window for inline scripts
if (typeof window !== 'undefined') {
  window.Framework = Framework;
}

// Add type declarations for window.Framework
declare global {
  interface Window {
    Framework: {
      data: typeof data;
      component: typeof component;
      hydrate: typeof hydrate;
      form: typeof form;
    };
  }
}

export default Framework;
