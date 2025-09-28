import './style.css';
import { signal, computed, effect } from '@preact/signals-core';
import Framework from './framework';
import { z } from 'zod';

Framework.data('counter', () => {
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

Framework.component('my-counter', ({ emit, ...props }: any) => {
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

console.log('main');

document.addEventListener('DOMContentLoaded', async () => {
  Framework.hydrate();
});

Framework.form(
  'userForm',
  {
    password: z
      .string()
      .min(4, 'Password is too short')
      .max(10, 'Password is too long')
      .regex(/\d/, 'Password must include at least one digit'),
  },
  (ev, values) => {
    ev.preventDefault();
    console.log('submit', values);
  },
);
