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
      if (el.closest('template')) return;

      const dataAttr = el.getAttribute('x-data');
      if (dataAttr && this.comp[dataAttr]) {
        const componentData = this.createReactiveData(this.comp[dataAttr]);
        (el as any)._data = componentData;
        this.bindDirectives(el, componentData);
      }
    });
  }

  data(id: string, setup: any) {
    this.comp[id] = setup();
  }

  private createReactiveData(data: any): any {
    const reactive: any = {};

    Object.keys(data).forEach((key) => {
      if (typeof data[key] === 'function') {
        reactive[key] = data[key].bind(reactive);
      } else {
        reactive[key] = signal(data[key]);
      }
    });

    return reactive;
  }

  private bindDirectives(el: Element, data: any) {
    if (el.closest('template')) {
      return;
    }
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
            // Handle signal objects - access their .value property
            textEl.textContent = value && typeof value === 'object' && 'value' in value ? value.value : value;
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

  component(tag, setup) {
    this.comp[tag] = setup;
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

    setTimeout(() => {
      this.initializeComponent();
    }, 0);
  }

  private initializeComponent() {
    // Get component setup data
    const componentName = this.tagName.toLowerCase();
    const componentSetup = ff.comp[componentName];
    let componentData = {};
    let props = {};

    // Evaluate props if x-props attribute exists
    const propsAttr = this.getAttribute('x-props');

    if (propsAttr) {
      const parentEl = this.closest('[x-data]');
      if (parentEl && (parentEl as any)._data) {
        const parentData = (parentEl as any)._data;
        try {
          props = new Function('parent', `with(parent) { return ${propsAttr} }`)(parentData);
        } catch (e) {
          console.error('Error evaluating props with parent:', e);
        }
      } else {
        try {
          props = new Function(`return (${propsAttr})`)();
        } catch (e) {
          console.error('Error evaluating props without parent context. Props must be static values:', e);
          props = {};
        }
      }
    }

    if (componentSetup) {
      componentData = componentSetup(props);
    }

    this._data = (ff as any).createReactiveData(componentData);

    // Make component data available on the component instance for template binding
    Object.assign(this, this._data);

    // Hydrate the component's own content after data is ready
    this.hydrateComponent();
  }

  private hydrateComponent() {
    // Bind directives to the component's content using the component's data
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

ff.data('counter', () => {
  const count = signal(8);
  const double = computed(() => count.value * 2);

  const increment = () => {
    count.value++;
  };
  const decrement = () => {
    count.value--;
  };

  return { count, double, increment, decrement };
});

ff.component('my-counter', (props: any) => {
  console.log(props);

  const x = signal(props.x.value ?? 0);
  const incr = () => {
    x.value++;
  };

  return { x, incr, title: props.title };
});

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('app');
  if (el) ff.hydrate(el);
});
