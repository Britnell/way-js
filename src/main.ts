import './style.css';
import { signal, computed } from '@preact/signals-core';
import { data, component, hydrate } from './framework';

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
  const incr = () => {
    x.value++;
  };

  const close = () => {
    emit('close', x.value);
  };
  function onDisconnected() {}

  return { x, incr, title: props.title, onDisconnected, count: 33, close };
});

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('app');
  if (el) hydrate(el);
});
