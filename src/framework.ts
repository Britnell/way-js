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
    const marker = createMarker(templateEl, 'x-if-end');
    const elseTemplate = findElseTemplate(templateEl);
    const elseMarker = elseTemplate ? createMarker(elseTemplate, 'x-else-end') : null;

    effect(() => {
      const shouldShow = evaluateExpression(expression, data);

      if (shouldShow) {
        removeNodesBetween(elseTemplate, elseMarker);
        if (!hasNodesBetween(templateEl, marker)) {
          renderTemplate(templateEl, marker, data);
        }
      } else {
        removeNodesBetween(templateEl, marker);
        if (elseTemplate && !hasNodesBetween(elseTemplate, elseMarker!)) {
          renderTemplate(elseTemplate, elseMarker!, data);
        }
      }
    });

    function renderTemplate(template: HTMLTemplateElement, marker: Comment, data: any) {
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      const children = Array.from(fragment.children);

      for (const child of children) {
        template.parentElement?.insertBefore(child, marker);
        if (child instanceof Element) {
          hydrate(child, data);
        }
      }
    }

    function removeNodesBetween(start: Element | null, end: Comment | null) {
      if (!start || !end) return;

      let current = start.nextSibling;
      while (current && current !== end) {
        const next = current.nextSibling;
        current.parentNode?.removeChild(current);
        current = next;
      }
    }

    function hasNodesBetween(start: Element | null, end: Comment | null): boolean {
      if (!start || !end) return false;
      return start.nextSibling !== end;
    }
  },
  'x-for': (el: Element, expression: string, data: any) => {
    if (!(el instanceof HTMLTemplateElement)) {
      console.error('x-for directive must be used on a <template> element.');
      return;
    }
    const templateEl = el;
    const [itemVar, indexVar, arrayExpr] = parseForExpression(expression);
    const container = templateEl.parentNode as HTMLElement;
    const keyAttr = templateEl.getAttribute(':key') || templateEl.getAttribute('x-key');

    let renderedItems = new Map<string, { nodes: Node[]; scope: any }>();

    effect(() => {
      const array = evaluateExpression(arrayExpr, data);

      if (!Array.isArray(array)) {
        console.error(`x-for expression "${arrayExpr}" did not evaluate to an array`);
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

        const key = keyAttr ? String(evaluateExpression(keyAttr, itemScope)) : String(index);
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

          // Insert the new nodes into the DOM temporarily
          container.insertBefore(tempWrapper, templateEl);

          // Get the inserted nodes
          const newNodes = Array.from(tempWrapper.childNodes);

          // Hydrate each new node with the item scope
          for (const node of newNodes) {
            if (node instanceof Element) {
              hydrate(node, itemScope);
            }
          }

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
  if (el._data) {
    Object.assign(context, el._data);
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
