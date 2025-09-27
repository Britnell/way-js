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

component('my-counter', (props: any) => {
  const x = signal(props.x?.value ?? 0);
  const incr = () => {
    x.value++;
  };

  function onDisconnected() {}

  return { x, incr, title: props.title, onDisconnected };
});

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('app');
  if (el) hydrate(el);
});
