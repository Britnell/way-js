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

      const setSignalValue = (obj: any, path: string, value: any) => {
        const parts = path.split('.');
        let current = obj;

        for (let i = 0; i < parts.length - 1; i++) {
          if (current[parts[i]] === undefined) return;
          current = current[parts[i]];
        }

        const lastPart = parts[parts.length - 1];
        if (current[lastPart] && typeof current[lastPart] === 'object' && 'value' in current[lastPart]) {
          current[lastPart].value = value;
        } else {
          current[lastPart] = value;
        }
      };

      console.log(data, expression, newValue);
      setSignalValue(data, expression, newValue);
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
      if (
        target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement)
      ) {
        validateField(target, formConfig);
      }
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

    const anchor = document.createComment(`x-for: ${expression}`);
    container.insertBefore(anchor, templateEl);

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

        let key: string;
        if (keyAttr) {
          key = String(evaluate(keyAttr, itemScope));
        } else {
          key = String(index);
        }

        let currentItem = renderedItems.get(key);

        if (currentItem) {
          Object.assign(currentItem.scope, itemScope);
          newNodesOrdered.push(...currentItem.nodes);
          newRenderedItems.set(key, currentItem);
          renderedItems.delete(key);
        } else {
          const fragment = templateEl.content.cloneNode(true) as DocumentFragment;
          const newScope = createItemContext(data, itemVar, indexVar, item, index);
          const tempWrapper = document.createElement('div');
          tempWrapper.appendChild(fragment);

          Object.keys(directives).forEach((dir) => {
            if (dir === 'x-for') return;
            tempWrapper.querySelectorAll(`[${dir}]`).forEach((childEl) => {
              const expr = childEl.getAttribute(dir);
              if (expr) {
                directives[dir](childEl, expr, newScope);
              }
            });
          });

          tempWrapper.querySelectorAll('*').forEach((childEl) => {
            Array.from(childEl.attributes).forEach((attr) => {
              if (!attr.name.startsWith('@')) return;
              const eventName = attr.name.substring(1);
              const eventExpr = attr.value;
              bindEvent(childEl, eventName, eventExpr, newScope);
            });
          });

          const newNodes = Array.from(tempWrapper.childNodes);
          newNodesOrdered.push(...newNodes);
          newRenderedItems.set(key, { nodes: newNodes, scope: newScope });
        }
      }

      renderedItems.forEach(({ nodes }) => {
        nodes.forEach((node) => container.removeChild(node));
      });

      let currentNode = anchor.nextSibling;
      let i = 0;
      while (i < newNodesOrdered.length) {
        const newNode = newNodesOrdered[i];
        if (currentNode === newNode) {
          currentNode = currentNode.nextSibling;
          i++;
        } else {
          container.insertBefore(newNode, currentNode);
          i++;
        }
      }

      while (currentNode && currentNode !== templateEl) {
        const nodeToRemove = currentNode;
        currentNode = currentNode.nextSibling;
        container.removeChild(nodeToRemove);
      }

      renderedItems = newRenderedItems;
    });
  },
};

function parseForExpression(expression: string): [string, string | null, string] {
  // Match "(item, index) in array" or "item in array"
  const match = expression.match(/\((\w+),\s*(\w+)\)\s+in\s+(.+)/) || expression.match(/(\w+)\s+in\s+(.+)/);
  if (!match) {
    throw new Error(`Invalid x-for expression: "${expression}"`);
  }

  if (match.length === 4) {
    // Format: (item, index) in array
    return [match[1], match[2], match[3].trim()];
  } else {
    // Format: item in array
    return [match[1], null, match[2].trim()];
  }
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

function processBuiltInDirectives(root: Element) {
  Object.keys(directives).forEach((dir) => {
    const selector = `[${dir}]`;
    root.querySelectorAll(selector).forEach((element) => {
      const expression = element.getAttribute(dir);
      if (expression) {
        const context = collectContext(element);
        directives[dir](element, expression, context);
      }
    });
  });
}

function processSpecialAttributes(root: Element) {
  root.querySelectorAll('*').forEach((element) => {
    const specialAttrs = Array.from(element.attributes).filter(
      (attr) => attr.name.startsWith('@') || attr.name.startsWith(':'),
    );

    if (specialAttrs.length === 0) return;

    const context = collectContext(element);

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
  });
}

function bindDirectives(el: Element) {
  if (el.closest('template')) return;

  processBuiltInDirectives(el);
  processSpecialAttributes(el);
}

function hydrate(el: Element) {
  const scope = el || document.body;

  // 1. x-data
  scope.querySelectorAll('[x-data]').forEach((el: Element) => {
    if (el.closest('template')) return;

    const dataAttr = el.getAttribute('x-data');
    if (dataAttr) {
      // Check if it's a registered component or an inline object
      if (components[dataAttr]) {
        (el as any)._data = components[dataAttr]();
      } else {
        // Try to evaluate as inline object and make properties reactive
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

  // 2. x-props
  scope.querySelectorAll('[x-props]').forEach((el: Element) => {
    if (el instanceof Component && !el._data) {
      hydrateWebComponent(el as Component);
    }
  });

  // 3. bind
  bindDirectives(document.body);
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

export { data, component, hydrate, form };
