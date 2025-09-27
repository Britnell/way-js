import './style.css';
import { signal, computed, effect } from '@preact/signals-core';
import { data, component, hydrate, form } from './framework';

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

import { z } from 'zod';

form(
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
