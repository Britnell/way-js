import './style.css';
import { createSignal, createEffect } from 'solid-js';

class Framework {
  private components: Record<string, any> = {};

  hydrate(el: Element = document.body) {
    const scope = el || document.body;
    scope.querySelectorAll('[x-data]').forEach((element: Element) => {
      const dataAttr = element.getAttribute('x-data');
      if (!dataAttr) return;

      let componentData;

      if (this.components[dataAttr]) {
        componentData = { ...this.components[dataAttr] };
      } else {
        try {
          componentData = new Function(`return (${dataAttr})`)();
        } catch (e) {
          console.error('Error parsing x-data:', e);
          return;
        }
      }

      if (componentData.setup) {
        componentData.setup.call(componentData);
      }

      this.bindDirectives(element, componentData);
    });
  }

  data(id: string, data: any) {
    this.components[id] = data;
  }

  private bindDirectives(el: Element, data: any) {
    this.bindText(el, data);
    this.bindEvents(el, data);
  }

  private bindText(el: Element, data: any) {
    const textEls = el.querySelectorAll('[x-text]');
    textEls.forEach((textEl: Element) => {
      const expr = textEl.getAttribute('x-text');
      if (expr) {
        createEffect(() => {
          try {
            const value = this.evaluateExpression(expr, data);
            textEl.textContent = value;
          } catch (e) {
            console.error('Error evaluating x-text:', e);
          }
        });
      }
    });
  }

  private bindEvents(el: Element, data: any) {
    const eventEls = el.querySelectorAll('[\\@click]');
    eventEls.forEach((eventEl: Element) => {
      const handler = eventEl.getAttribute('@click');
      if (handler) {
        eventEl.addEventListener('click', (e) => {
          try {
            this.evaluateExpression(handler, data, e);
          } catch (err) {
            console.error('Error in click handler:', err);
          }
        });
      }
    });
  }

  private evaluateExpression(expr: string, data: any, event?: Event) {
    const context: Record<string, any> = {};

    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (key === 'setup') return;

      if (typeof value === 'function' && value.length === 0) {
        context[key] = value;
      } else if (typeof value === 'function') {
        context[key] = value.bind(data);
      } else {
        context[key] = value;
      }
    });

    return new Function('data', '$event', `with(data) { return ${expr} }`)(context, event);
  }
}

const ff = new Framework();

ff.data('counter', {
  setup() {
    const [count, setCount] = createSignal(0);
    this.count = count;
    this.setCount = setCount;

    const double = () => count() * 2;
    this.double = double;
  },

  increment() {
    this.setCount(this.count() + 1);
  },

  decrement() {
    this.setCount(this.count() - 1);
  },
});

document.addEventListener('DOMContentLoaded', () => {
  ff.hydrate(document.body);
});
