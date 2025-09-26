import './style.css';
import { signal, effect } from '@preact/signals-core';

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
    
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'function') {
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
    const clickEls = el.querySelectorAll('[x-click]');
    clickEls.forEach((clickEl: Element) => {
      const expr = clickEl.getAttribute('x-click');
      if (expr) {
        clickEl.addEventListener('click', () => {
          try {
            new Function('data', `with(data) { ${expr} }`)(data);
          } catch (e) {
            console.error('Error evaluating x-click:', e);
          }
        });
      }
    });
  }

  }

const ff = new Framework();

ff.data('counter', { 
  x: 1,
  increment() { this.x.value++ },
  decrement() { this.x.value-- }
});

document.addEventListener('DOMContentLoaded', () => {
  ff.hydrate(document.body);
});
