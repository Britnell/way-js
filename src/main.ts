import './style.css';
import { signal, computed, effect, Signal } from '@preact/signals-core';
import Framework from './framework';
import z from 'zod';

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

type Props = {
  x: Signal<number>;
  title?: string;
};

Framework.component<Props>('my-counter', (props, { emit }) => {
  const x = signal(props.x?.value ?? 0);
  const val = signal('abc');
  const uppercase = computed(() => val.value.toUpperCase());

  effect(() => {
    x.value = props.x.value;
  });

  const incr = () => x.value++;

  const close = () => emit('close', x.value);

  function onUnmounted() {
    //
  }

  return { x, incr, title: props.title, onUnmounted, count: 33, close, val, uppercase };
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

Framework.render(document.body, window.pageprops);
// document.addEventListener('DOMContentLoaded', async () => {});
