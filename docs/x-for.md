# x-for — Design Notes

## How it works

`x-for` wraps a `<template>` in a `<div style="display:contents">` wrapper and runs an `effect()` that re-evaluates the list expression whenever the array signal changes. On each run it diffs against the previous render using a key map, reusing DOM nodes whose key and data haven't changed, and creating new ones for anything that has.

The key comparison is **referential equality** (`===`). An item is reused if `oldItem === newItem`. This is intentional — it maps directly to how preact/signals-core works.

## How preact signals detects change

Preact signals use strict `===` equality. A signal only notifies subscribers when its value is *replaced* with a different reference:

```js
const arr = signal([1, 2, 3])
arr.value.push(4)          // same array reference → no notification, nothing reruns
arr.value = [...arr.value, 4]  // new reference → x-for effect reruns
```

Mutating in place is invisible to the signal system entirely.

## The required pattern: immutable updates

Because of the above, list mutations must always produce a new array reference:

```js
// correct
list.value = [...list.value, newItem]
list.value = list.value.filter(it => it.id !== id)
list.value = list.value.map(it => it.id === id ? { ...it, name: val } : it)

// broken — x-for never reruns
list.value.push(newItem)
list.value[0].name = 'new'
```

## Could we do a deep equality check instead?

Yes, but the cost compounds. On every array signal change you'd deep-compare every item against its previous version — O(depth) per item, per render. For large lists with nested objects this adds up on every keystroke or tick. Reference equality is O(1). Libraries like Immer get around this with structural sharing: unchanged subtrees keep the same reference, so deep-change semantics come for free with reference-equality speed.

## What about an array of signals?

An alternative model: make each list item a signal rather than a plain object.

```js
const list = signal([
  signal({ id: 1, name: 'one' }),
  signal({ id: 2, name: 'two' }),
])
```

This gives you two **independent** reactive update paths:

| Change | What happens |
|---|---|
| Add/remove/reorder — replace `list.value` | x-for effect reruns, DOM is diffed, structure updated |
| Edit a field — write to inner signal `list.value[0].value = {...}` | Only that item's child bindings update, x-for does NOT rerun |

The signal graph already knows exactly what changed, so deep equality checking becomes irrelevant. Item content updates bypass x-for entirely and go straight to the relevant DOM node — closer to how SolidJS `<For>` works internally.

The tradeoff is ergonomics: templates must use `item.value.name` instead of `item.name`, and update sites write `item.value = { ...item.value, name: 'new' }` rather than replacing in the parent array.

## Comparison with SolidJS

SolidJS offers two primitives:

- `createSignal` with an array — same situation as way.js, must replace the whole array to trigger updates
- `createStore` — Proxy-based deep reactivity. Any nested write is tracked automatically: `store.items[0].name = 'new'` updates only the binding that reads that property. This is the ergonomic ideal but requires a Proxy wrapper that way.js doesn't currently have.

## Open questions

- Should x-for warn when `x-key` is absent on a non-primitive list? Currently falls back to `index-${i}` silently, which causes full re-render on reorder.
- Would a `way.reactive()` Proxy wrapper (similar to SolidJS `createStore`) be worth adding for deeply-reactive objects?
- Effects inside x-for items are never disposed when items are removed — see memory leak tickets in todo.md.
