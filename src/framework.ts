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
};

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

  // Handle custom @event directives
  el.querySelectorAll('*').forEach((childEl) => {
    Array.from(childEl.attributes).forEach((attr) => {
      if (!attr.name.startsWith('@')) {
        return;
      }

      const eventName = attr.name.substring(1);
      const expression = attr.value;
      if (expression) {
        const context = collectContext(childEl);

        // Find emit function from nearest web component parent
        const findEmit = (el: Element): ((eventName: string, ...args: any[]) => void) | null => {
          if (el instanceof Component && el._data) {
            return createEmit(el);
          }
          return el.parentElement ? findEmit(el.parentElement) : null;
        };

        const emit = findEmit(childEl);

        childEl.addEventListener(eventName, (event: Event) => {
          const eventContext = {
            ...context,
            $event: event,
            emit,
          };
          evaluate(expression, eventContext);
        });
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
