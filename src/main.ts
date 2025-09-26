import './style.css';
import { signal, effect, computed } from '@preact/signals-core';

class Framework {
  comp: Record<string, any>;

  constructor() {
    this.comp = {};
  }

  hydrate(el: Element) {
    const scope = el || document.body;
    scope.querySelectorAll('[x-data]').forEach((el: Element) => {
      const dataAttr = el.getAttribute('x-data');
      if (dataAttr && this.comp[dataAttr]) {
        const componentData = this.createReactiveData(this.comp[dataAttr]);
        (el as any)._data = componentData;
        this.bindDirectives(el, componentData);
      }
    });
  }

  data(id: string, initial: any) {
    this.comp[id] = initial;
  }

  private createReactiveData(data: any): any {
    const reactive: any = {};

    Object.keys(data).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(data, key);

      if (descriptor && descriptor.get) {
        // Handle getter properties (computed values)
        Object.defineProperty(reactive, key, {
          get: descriptor.get.bind(reactive),
          enumerable: true,
        });
      } else if (typeof data[key] === 'function') {
        reactive[key] = data[key].bind(reactive);
      } else {
        reactive[key] = signal(data[key]);
      }
    });

    return reactive;
  }

  private bindDirectives(el: Element, data: any) {
    this.bindText(el, data);
    this.bindClick(el, data);
  }

  private bindText(el: Element, data: any) {
    const textEls = el.querySelectorAll('[x-text]');
    textEls.forEach((textEl: Element) => {
      const expr = textEl.getAttribute('x-text');
      if (expr) {
        effect(() => {
          try {
            const value = new Function('data', `with(data) { return ${expr} }`)(data);
            textEl.textContent = value;
          } catch (e) {
            console.error('Error evaluating x-text:', e);
          }
        });
      }
    });
  }

  private bindClick(el: Element, data: any) {
    const clickEls = el.querySelectorAll('[\\@click]');
    clickEls.forEach((clickEl: Element) => {
      const expr = clickEl.getAttribute('@click');
      if (expr) {
        clickEl.addEventListener('click', () => {
          try {
            new Function('data', `with(data) { ${expr} }`)(data);
          } catch (e) {
            console.error('Error evaluating @click:', e);
          }
        });
      }
    });
  }

  component(tag) {
    const template = document.getElementById(tag);
    if (template) {
      createWebcomponent(tag, template);
    }
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

    const counterData = { ...ff.comp.counter };

    // Find parent x-data scope and evaluate props
    const parentEl = this.closest('[x-data]');
    if (parentEl && (parentEl as any)._data) {
      const parentData = (parentEl as any)._data;
      const propsAttr = this.getAttribute('x-props');
      if (propsAttr) {
        try {
          const props = new Function('parent', `with(parent) { return ${propsAttr} }`)(parentData);
          Object.assign(counterData, props);
        } catch (e) {
          console.error('Error evaluating props:', e);
        }
      }
    }

    this._data = (ff as any).createReactiveData(counterData);
    (ff as any).bindDirectives(this, this._data);
  }
}

function createWebcomponent(tag: string, template: HTMLElement) {
  class WebComponent extends Component {
    constructor() {
      super(template);
    }
  }

  customElements.define(tag, WebComponent);
}

const ff = new Framework();

ff.data('counter', {
  x: 1,
  // double: computed(() => this.x.value * 2),
  get double() {
    return this.x.value * 2;
  },
  increment() {
    this.x.value++;
  },
  decrement() {
    this.x.value--;
  },
  incr() {
    this.x.value++;
  },
});

ff.component('my-counter');

document.addEventListener('DOMContentLoaded', () => {
  ff.hydrate(document.body);
});
