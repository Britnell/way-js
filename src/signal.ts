import { Signal } from "signal-polyfill";

// Signal wrapper functions using browser standard signals
let needsEnqueue = true;

const watcher = new Signal.subtle.Watcher(() => {
  if (needsEnqueue) {
    needsEnqueue = false;
    queueMicrotask(processPending);
  }
});

function processPending() {
  needsEnqueue = true;

  for (const s of watcher.getPending()) {
    s.get();
  }

  watcher.watch();
}

export function effect(callback: () => void | (() => void)) {
  let cleanup: (() => void) | undefined;

  const computed = new Signal.Computed(() => {
    typeof cleanup === "function" && cleanup();
    const result = callback();
    cleanup = result === undefined ? undefined : result;
  });

  watcher.watch(computed);
  computed.get();

  return () => {
    watcher.unwatch(computed);
    typeof cleanup === "function" && cleanup();
    cleanup = undefined;
  };
}

export function signal<T>(value: T) {
  const state = new Signal.State(value);

  return {
    get value() {
      return state.get();
    },
    set value(newValue: T) {
      state.set(newValue);
    },
    peek() {
      return state.get();
    },
  };
}

export function computed<T>(fn: () => T) {
  const computed = new Signal.Computed(fn);

  return {
    get value() {
      return computed.get();
    },
    peek() {
      return computed.get();
    },
  };
}
