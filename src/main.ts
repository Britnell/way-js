import './style.css';
import { signal, computed, effect, Signal } from '@preact/signals-core';
import Way from './framework';
import z from 'zod';

Way.comp('counter', () => {
  const count = signal(0);
  const double = computed(() => count.value * 2);
  const incr = () => count.value++;
  const decr = () => count.value--;
  return { count, double, incr, decr };
});

type Props = {
  x: Signal<number>;
  title?: string;
};

Way.form(
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

Way.store('theme', () => {
  const color = Way.signal('red');
  return { color };
});
Way.render(document.body, window.pageprops);
// document.addEventListener('DOMContentLoaded', async () => {});