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
  'x-for': (templateEl: HTMLTemplateElement, expression, data) => {
    const [itemVar, indexVar, arrayExpr] = parseForExpression(expression);

    // Track rendered items by key
    const renderedItems = new Map<string, { element: HTMLElement, context: any }>();
    const container = templateEl.parentNode as HTMLElement;
    const keyAttr = templateEl.getAttribute(':key') || templateEl.getAttribute('x-key');

    effect(() => {
      const array = evaluate(arrayExpr, data);
      const actualArray = array && typeof array === 'object' && 'value' in array ? array.value : array;

      if (!Array.isArray(actualArray)) {
        console.warn(`x-for expression "${arrayExpr}" did not evaluate to an array`);
        return;
      }

      const currentKeys = new Set<string>();

      // Process each item in the array
      actualArray.forEach((item, index) => {
        const itemData = createItemContext(data, itemVar, indexVar, item, index);

        // Get key for tracking
        let key: string;
        if (keyAttr) {
          key = String(evaluate(keyAttr, itemData));
        } else {
          key = `item-${index}`;
        }

        currentKeys.add(key);

        // Check if we already have this item rendered
        if (!renderedItems.has(key)) {
          // Clone template content
          const content = templateEl.content.cloneNode(true) as DocumentFragment;
          const wrapper = document.createElement('div');
          wrapper.appendChild(content);

          // Find and bind all directives within the cloned content
          const bindDirectivesWithContext = (element: Element, context: any) => {
            // Handle built-in directives
            Object.keys(directives).forEach((dir) => {
              const selector = `[${dir}]`;
              element.querySelectorAll(selector).forEach((childEl) => {
                const expression = childEl.getAttribute(dir);
                if (expression) {
                  directives[dir](childEl, expression, context);
                }
              });
            });

            // Handle custom @event directives
            element.querySelectorAll('*').forEach((childEl) => {
              Array.from(childEl.attributes).forEach((attr) => {
                if (!attr.name.startsWith('@')) {
                  return;
                }

                const eventName = attr.name.substring(1);
                const expression = attr.value;
                if (expression) {
                  const contextForEvent = collectContext(childEl);

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
                      ...contextForEvent,
                      $event: event,
                      emit,
                    };
                    evaluate(expression, eventContext);
                  });
                }
              });
            });
          };

          // Bind directives with item-specific context
          bindDirectivesWithContext(wrapper, itemData);

          // Extract the actual elements (skip the wrapper div)
          const fragment = document.createDocumentFragment();
          while (wrapper.firstChild) {
            fragment.appendChild(wrapper.firstChild);
          }

          renderedItems.set(key, {
            element: fragment.cloneNode(true) as HTMLElement,
            context: itemData
          });
        } else {
          // Update existing item's context
          renderedItems.get(key)!.context = itemData;
        }
      });

      // Clear existing content
      while (container.firstChild && container.firstChild !== templateEl) {
        container.removeChild(container.firstChild);
      }

      // Insert new content before the template
      currentKeys.forEach(key => {
        const itemData = renderedItems.get(key);
        if (itemData) {
          const clonedItem = itemData.element.cloneNode(true);

          // Re-bind directives with updated context
          const bindDirectivesWithContext = (element: Element, context: any) => {
            // Handle built-in directives
            Object.keys(directives).forEach((dir) => {
              const selector = `[${dir}]`;
              element.querySelectorAll(selector).forEach((childEl) => {
                const expression = childEl.getAttribute(dir);
                if (expression) {
                  directives[dir](childEl, expression, context);
                }
              });
            });
          };

          bindDirectivesWithContext(clonedItem, itemData.context);
          container.insertBefore(clonedItem, templateEl);
        }
      });

      // Clean up unused items
      renderedItems.forEach((_, key) => {
        if (!currentKeys.has(key)) {
          renderedItems.delete(key);
        }
      });
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

function createItemContext(baseContext: any, itemVar: string, indexVar: string | null, itemValue: any, index: number): any {
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
