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
  console.log(props);

  const x = signal(props.x.value ?? 0);
  const incr = () => {
    x.value++;
  };

  function onConnected() {
    console.log('my-counter connected');
  }

  function onDisconnected() {
    console.log('my-counter disconnected');
  }

  return { x, incr, title: props.title, onConnected, onDisconnected };
});

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('app');
  if (el) hydrate(el);
});
