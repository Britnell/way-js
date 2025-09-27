declare global {
  interface Element {
    _data?: any;
  }
}

import { effect } from '@preact/signals-core';

const components: Record<string, any> = {};

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
      el.textContent = value && typeof value === 'object' && 'value' in value ? value.value : value;
    });
  },
  'x-if': (el, expression, data) => {
    effect(() => {
      const value = evaluate(expression, data);
      const actualValue = value && typeof value === 'object' && 'value' in value ? value.value : value;
      (el as HTMLElement).style.display = actualValue ? '' : 'none';
    });
  },
  'x-else': (el, expression, data) => {
    effect(() => {
      const value = evaluate(expression, data);
      const actualValue = value && typeof value === 'object' && 'value' in value ? value.value : value;
      (el as HTMLElement).style.display = actualValue ? '' : 'none';
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
      const actualArray = array && typeof array === 'object' && 'value' in array ? array.value : array;

      if (!Array.isArray(actualArray)) {
        console.warn(`x-for expression "${arrayExpr}" did not evaluate to an array`);
        renderedItems.forEach(({ nodes }) => {
          nodes.forEach((node) => container.removeChild(node));
        });
        renderedItems.clear();
        return;
      }

      const newRenderedItems = new Map<string, { nodes: Node[]; scope: any }>();
      const newNodesOrdered: Node[] = [];

      for (let index = 0; index < actualArray.length; index++) {
        const item = actualArray[index];
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
    const actualValue = value && typeof value === 'object' && 'value' in value ? value.value : value;

    if (propName === 'class') {
      // Handle class binding specially
      if (typeof actualValue === 'string') {
        (element as HTMLElement).className = actualValue;
      } else if (Array.isArray(actualValue)) {
        (element as HTMLElement).className = actualValue.join(' ');
      } else if (typeof actualValue === 'object') {
        // Handle object format { active: true, disabled: false }
        const classes = Object.entries(actualValue)
          .filter(([_, active]) => active)
          .map(([className]) => className)
          .join(' ');
        (element as HTMLElement).className = classes;
      }
    } else if (propName === 'style') {
      // Handle style binding
      if (typeof actualValue === 'string') {
        (element as HTMLElement).style.cssText = actualValue;
      } else if (typeof actualValue === 'object') {
        // Handle object format { color: 'red', fontSize: '14px' }
        Object.entries(actualValue).forEach(([key, val]) => {
          (element as HTMLElement).style[key as any] = val;
        });
      }
    } else {
      // Handle all other properties
      if (actualValue === false || actualValue === null || actualValue === undefined) {
        element.removeAttribute(propName);
      } else {
        element.setAttribute(propName, String(actualValue));
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

function bindDirectives(el: Element) {
  if (el.closest('template')) return;

  // Handle built-in directives
  Object.keys(directives).forEach((dir) => {
    const selector = `[${dir}]`;
    el.querySelectorAll(selector).forEach((childEl) => {
      const expression = childEl.getAttribute(dir);
      if (expression) {
        const context = collectContext(childEl);
        directives[dir](childEl, expression, context);
      }
    });
  });

  // Handle custom @event and :property directives
  el.querySelectorAll('*').forEach((childEl) => {
    const specialAttrs = Array.from(childEl.attributes).filter(attr =>
      attr.name.startsWith('@') || attr.name.startsWith(':')
    );

    if (specialAttrs.length === 0) return;

    const context = collectContext(childEl);

    specialAttrs.forEach((attr) => {
      const expression = attr.value;
      if (!expression) return;

      if (attr.name.startsWith('@')) {
        const eventName = attr.name.substring(1);
        bindEvent(childEl, eventName, expression, context);
      } else if (attr.name.startsWith(':')) {
        const propName = attr.name.substring(1);
        bindProperty(childEl, propName, expression, context);
      }
    });
  });
}

function hydrate(el: Element) {
  const scope = el || document.body;

  // 1. x-data
  scope.querySelectorAll('[x-data]').forEach((el: Element) => {
    if (el.closest('template')) return;

    const dataAttr = el.getAttribute('x-data');
    if (dataAttr && components[dataAttr]) {
      (el as any)._data = components[dataAttr]();
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
  const parentEl = component.closest('[x-data]');
  const parentData = parentEl ? (parentEl as any)._data : {};

  const props = parseProps(component.getAttribute('x-props') || '', parentData);

  // Add emit function to props
  const emit = createEmit(component);

  component._data = componentSetup({ ...props, emit });
}

function data(id: string, setup: any) {
  components[id] = setup;
}

function component(tag: string, setup: any) {
  components[tag] = setup;
  const template = document.getElementById(tag) as HTMLTemplateElement;
  if (template) {
    createWebComponent(tag, template);
  }
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

export { data, component, hydrate };
