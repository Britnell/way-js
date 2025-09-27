import { signal, effect, computed } from '@preact/signals-core';

const components: Record<string, any> = {};

function createReactiveData(data: any): any {
  const reactive: any = {};
  Object.keys(data).forEach((key) => {
    const value = data[key];
    if (typeof value === 'function') {
      reactive[key] = value.bind(reactive);
    } else {
      reactive[key] = signal(value);
    }
  });
  return reactive;
}

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
  '@click': (el, expression, data) => {
    el.addEventListener('click', () => {
      evaluate(expression, data);
    });
  },
};

function collectContext(el: Element): any {
  const context: any = {};

  // Collect from x-data parents (closest first)
  const parents = [];
  let current = el.parentElement;
  while (current) {
    if (current._data) {
      // Add to end - closest parent last
      parents.push(current);
    }
    current = current.parentElement;
  }

  // Merge parent data (closest parent overwrites distant ones)
  parents.forEach((parent) => {
    Object.assign(context, parent._data);
  });

  // Add current element's data if it's a web component (highest precedence)
  if (el instanceof Component && el._data) {
    Object.assign(context, el._data);
  }

  return context;
}

function bindDirectives(el: Element) {
  if (el.closest('template')) return;
  Object.keys(directives).forEach((dir) => {
    const selector = `[${dir.replace('@', '\\@')}]`;
    el.querySelectorAll(selector).forEach((childEl) => {
      const expression = childEl.getAttribute(dir);
      if (expression) {
        const context = collectContext(childEl);
        directives[dir](childEl, expression, context);
      }
    });
  });
}

function hydrate(el: Element) {
  const scope = el || document.body;

  // First pass: hydrate all x-data elements
  scope.querySelectorAll('[x-data]').forEach((el: Element) => {
    if (el.closest('template')) return;

    const dataAttr = el.getAttribute('x-data');
    if (dataAttr && components[dataAttr]) {
      const componentData = createReactiveData(components[dataAttr]());
      (el as any)._data = componentData;
    }
  });

  // Second pass: hydrate web components with x-props
  scope.querySelectorAll('[x-props]').forEach((el: Element) => {
    if (el instanceof Component && !el._data) {
      hydrateWebComponent(el as Component);
    }
  });

  // Final pass: bind all directives with full context
  bindDirectives(document.body);
  // scope.querySelectorAll('[x-data], [x-props]').forEach((el: Element) => {
  //   if (el.closest('template')) return;
  //   bindDirectives(el);
  // });
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

  const componentData = componentSetup(props);
  component._data = createReactiveData(componentData);

  // if (component._data.onConnected) {
  //   component._data.onConnected();
  // }
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
    if (this._data && this._data.onDisconnected) {
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
