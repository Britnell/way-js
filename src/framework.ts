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

function bindDirectives(el: Element, data: any) {
  if (el.closest('template')) return;
  Object.keys(directives).forEach((dir) => {
    const selector = `[${dir.replace('@', '\\@')}]`;
    el.querySelectorAll(selector).forEach((childEl) => {
      const expression = childEl.getAttribute(dir);
      if (expression) {

        directives[dir](childEl, expression, data);
      }
    });
  });
}

function hydrate(el: Element) {
  const scope = el || document.body;
  scope.querySelectorAll('[x-data]').forEach((el: Element) => {
    if (el.closest('template')) return;

    const dataAttr = el.getAttribute('x-data');
    if (dataAttr && components[dataAttr]) {
      const componentData = createReactiveData(components[dataAttr]());
      (el as any)._data = componentData;
      bindDirectives(el, componentData);
    }
  });
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
  return evaluate(propsAttr, parentData);
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
    queueMicrotask(() => this.initializeComponent());
  }

  disconnectedCallback() {
    if (this._data && this._data.onDisconnected) {
      this._data.onDisconnected();
    }
  }

  private initializeComponent() {
    const componentName = this.tagName.toLowerCase();
    const componentSetup = components[componentName];
    if (!componentSetup) return;

    const parentEl = this.closest('[x-data]');
    const parentData = (parentEl ? (parentEl as any)._data : {}) || {};
    const props = parseProps(this.getAttribute('x-props') || '', parentData);

    const componentData = componentSetup(props);
    this._data = createReactiveData(componentData);

    if (this._data.onConnected) {
      this._data.onConnected();
    }

    bindDirectives(this, this._data);
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