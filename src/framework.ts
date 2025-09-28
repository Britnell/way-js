declare global {
  interface Element {
    _data?: any;
  }
}

import { signal, effect } from '@preact/signals-core';
import {
  createMarker,
  createWebComponent,
  evaluateExpression,
  findElseTemplate,
  getInputValue,
  getItemKey,
  hasContentAfter,
  parseForExpression,
  removeNodesUntil,
  setInputValue,
} from './helper';

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
  'x-form': (el, expression, _data) => {
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
  },
  'x-if': (el: Element, expression: string, data: any) => {
    if (!(el instanceof HTMLTemplateElement)) {
      console.error('x-if directive must be used on a <template> element.');
      return;
    }

    const templateEl = el;
    createMarker(templateEl, 'x-if-end');
    const elseTemplate = findElseTemplate(templateEl);
    if (elseTemplate) createMarker(elseTemplate, 'x-else-end');

    let lastState: boolean | null = null;

    effect(() => {
      const shouldShow = evaluateExpression(expression, data);

      // Only update when the condition actually changes
      if (lastState === shouldShow) return;
      lastState = shouldShow;

      if (shouldShow) {
        removeNodesUntil(elseTemplate, 'x-else-end');
        if (!hasContentAfter(templateEl, 'x-if-end')) {
          renderTemplate(templateEl, data);
        }
      } else {
        removeNodesUntil(templateEl, 'x-if-end');
        if (elseTemplate && !hasContentAfter(elseTemplate, 'x-else-end')) {
          renderTemplate(elseTemplate, data);
        }
      }
    });
  },
  'x-for': (el: Element, expression: string, data: any) => {
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
  },
};

function renderTemplate(template: HTMLTemplateElement, data: any) {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const children = Array.from(fragment.children);

  for (const child of children) {
    template.parentElement?.insertBefore(child, template.nextSibling);
    if (child instanceof Element) {
      hydrate(child, data);
    }
  }
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

//  * Hydration

async function render(root: Element) {
  await waitForWebComponents();

  hydrate(root);
}

function hydrate(root: Element = document.body, initialContext = {}) {
  traverseDOM(root, initialContext, (el, ctx) => {
    let newContext = { ...ctx };

    // x-data
    newContext = hydrateData(el, newContext);

    // components
    const componentContext = hydrateWebComponentInTraversal(el, newContext);
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

async function waitForWebComponents(): Promise<void> {
  const potentialTags = Object.keys(components).filter((tag) => tag.includes('-'));
  if (potentialTags.length > 0) {
    const definitionPromises = potentialTags.map((tag) => customElements.whenDefined(tag).catch(() => null));
    await Promise.all(definitionPromises);
  }
}

function hydrateWebComponentInTraversal(element: Element, context: any): any {
  // Check if this is a web component (tag contains dash)
  if (!element.tagName.includes('-')) return context;

  // Check if it's a registered component
  const componentName = element.tagName.toLowerCase();
  if (!components[componentName]) return context;

  // Skip if already hydrated
  if (element._data) return context;

  // Parse props using parent context
  const props = parseProps(element.getAttribute('x-props') || '', context);

  // Add emit function
  const emit = createEmit(element);

  // Hydrate the component
  element._data = components[componentName]({ ...props, emit });

  // Return new context with component data added
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
