import './style.css';
import { signal, computed, effect } from '@preact/signals-core';
import { data, component, hydrate, input } from './framework';

// A simple mock of Zod for demonstration
const z = {
  string: () => ({
    _rules: [] as any[],
    min(length: number, message?: string) {
      this._rules.push({ type: 'too_short', length, message: message || `String must contain at least ${length} character(s)` });
      return this;
    },
    max(length: number, message?: string) {
      this._rules.push({ type: 'too_long', length, message: message || `String must contain at most ${length} character(s)` });
      return this;
    },
    email(message?: string) {
      this._rules.push({ type: 'invalid_email', message: message || 'Invalid email' });
      return this;
    },
    hasDigit(message?: string) {
      this._rules.push({ type: 'no_digit', message: message || 'String must contain at least one digit' });
      return this;
    },
    safeParse(value: string) {
      const errors: Record<string, string> = {};
      let hasErrors = false;

      for (const rule of this._rules) {
        if (rule.type === 'too_short' && value.length < rule.length) {
          errors[rule.type] = rule.message;
          hasErrors = true;
        }
        if (rule.type === 'too_long' && value.length > rule.length) {
          errors[rule.type] = rule.message;
          hasErrors = true;
        }
        if (rule.type === 'invalid_email' && !/^\S+@\S+\.\S+$/.test(value)) {
            errors[rule.type] = rule.message;
            hasErrors = true;
        }
        if (rule.type === 'no_digit' && !/\d/.test(value)) {
            errors[rule.type] = rule.message;
            hasErrors = true;
        }
      }

      if (hasErrors) {
        return { success: false, error: { flatten: () => ({ fieldErrors: errors }) } };
      }
      return { success: true, data: value };
    }
  })
};

data('counter', () => {
  const count = signal(0);
  const double = computed(() => count.value * 2);

  const increment = () => {
    count.value++;
  };

  const decrement = () => {
    count.value--;
  };

  return { count, double, increment, decrement };
});

component('my-counter', ({ emit, ...props }: any) => {
  const x = signal(props.x?.value ?? 0);
  // const x = props.x;

  const incr = () => {
    x.value++;
  };

  const close = () => {
    emit('close', x.value);
  };
  function onDisconnected() {
    //
  }

  effect(() => {
    x.value = props.x.value;
  });

  const val = signal('abc');
  const uppercase = computed(() => val.value.toUpperCase());

  return { x, incr, title: props.title, onDisconnected, count: 33, close, val, uppercase };
});

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('app');
  if (el) hydrate(el);
});

input('password', z.string().min(8, 'Password is too short').max(20, 'Password is too long').hasDigit('Password must include at least one digit'));