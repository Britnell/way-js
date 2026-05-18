# Todo

## Bugs

### `onMounted` never fires
**File:** `src/way.ts` — `wayComponent.connectedCallback` (~line 867), `hydrateWebComponent` (~line 393)

`connectedCallback` checks `this._data?.onMounted()` immediately when the element upgrades and connects to the DOM. However `_data` is only set later when `hydrateWebComponent` runs during `way.render()`. Because the custom element upgrades before `render` runs, `_data` is always `undefined` at the time `connectedCallback` fires, so `onMounted` is never called.

Fix: call `onMounted` inside `hydrateWebComponent` after assigning `_data`, or restructure so setup runs inside the web component lifecycle.

---

### `@click="handleClick"` (function reference) does nothing
**File:** `src/way.ts` — `bindEvent` (~line 568)

`bindEvent` calls `evaluateExpression(expression, eventContext)` which evaluates the expression and returns the result — but if the expression is a function reference (e.g. `handleClick`), the function is read but never called. Only `@click="handleClick()"` (an invocation expression) works. The README example shows `<button @click="handleClick">` which is silently broken.

Fix: check if `evaluateExpression` returns a function and, if so, call it with the event: `const result = evaluate(...); if (typeof result === 'function') result(event);`

---

### Double-hydration when `way.render()` called manually
**File:** `src/way.ts` — auto-render at line 765, also exported `render` API

`render(document.body, ...)` is automatically invoked on `DOMContentLoaded`. The README also instructs users to call `way.render(document.body)` from their `main.ts`. Both paths run `hydrate` on the same tree, so every `effect()` call in every directive is registered twice — event handlers double-fire, x-model has two conflicting writers, x-text renders twice, etc.

Fix: either remove the auto-render, remove the manual-render instruction from docs, or guard with a flag so hydration only runs once.

---

### Setup function runs twice when `x-comp` is on a web component tag
**File:** `src/way.ts` — `hydrateData` (~line 335) and `hydrateWebComponent` (~line 393)

When `<x-counter x-comp="x-counter">` is used (or when a web component element also carries `x-comp` with the same name), both `hydrateData` and `hydrateWebComponent` match and call the setup function. `_data` is overwritten by the second call, signals are duplicated, and any side effects in setup run twice.

Fix: in `hydrateWebComponent`, skip if `element._data` is already populated by `hydrateData`, or remove `hydrateWebComponent` entirely and handle web components purely via `x-comp`.

---

### `x-show` with `x-else` claims unrelated siblings
**File:** `src/way.ts` — `x-show` directive (~line 19)

The `x-show` handler grabs `el.nextElementSibling` and toggles its display if it has `x-else`. This is positional — any immediately following element with `x-else` is affected, including `<template x-else>` elements belonging to a different `x-if` chain that happen to follow the `x-show` element. This causes unintended show/hide of unrelated DOM.

Fix: use a distinct attribute for x-show's else branch (e.g. `x-show-else`), or add a marker on the pair during hydration.

---

### Event modifier `.outside` is broken
**File:** `src/way.ts` — `eventModifiers.outside` (~line 523)

The `outside` modifier registers the listener on the *element itself*. A click outside the element never reaches the element via bubbling, so the handler never fires. The modifier checks `element.contains(event.target)` but that check is never reached because outside clicks don't trigger the element's listener.

Fix: register `.outside` as a `document`-level listener and filter to run the handler only when the click target is outside `element`. Remember to remove the document listener on element disconnect.

---

### `:class` binding doesn't clear old classes when expression becomes falsy
**File:** `src/way.ts` — `bindProperty` (~line 479)

When `propName === 'class'` and `!value`, the function returns early without doing anything. If the expression previously set classes and now evaluates to `null`/`""`, the old classes remain on the element.

Fix: remove the early-return; let the empty/null case fall through and clear `className`.

---

## Memory Leaks

### Effects are never disposed (general)
**File:** `src/way.ts` — every `effect(() => ...)` call site

`@preact/signals-core`'s `effect()` returns a dispose function. Way discards this return value everywhere. When x-if swaps branches or x-for removes items, the DOM nodes are removed but all `effect`s they created remain subscribed to their signals indefinitely. On a page with frequent re-renders this grows without bound.

Fix: wrap `effect(fn)` in a helper that stores the dispose function on the element (e.g. `element.__effects = []`). When clearing a subtree (`wrapper.innerHTML = ""`, `el.remove()`, etc.), walk the subtree and call all stored dispose functions first.

---

### x-if does not dispose effects from removed branch
**File:** `src/way.ts` — `ifDirective` (~line 278)

`wrapper.innerHTML = ""` removes the DOM but does not dispose any effects set up during hydration of the previous branch. Every conditional flip leaks all effects from the outgoing branch.

Blocked by / same fix as: **Effects are never disposed (general)**.

---

### x-for does not dispose effects from removed/replaced items
**File:** `src/way.ts` — `forLoopDirective` (~line 173)

`el.remove()` and `wrapper.replaceChildren(fragment)` remove DOM without disposing child effects. List churn (sorting, filtering, updating items) continuously leaks effects.

Blocked by / same fix as: **Effects are never disposed (general)**.

---

## Reactivity / Evaluator

### `evaluateExpression` silently swallows all errors
**File:** `src/way.ts` — `evaluateExpression` (~line 782)

The catch block returns `null` for any error. A typo in a template expression (`{item.nme}`, missing method, etc.) silently produces `null` and downstream bindings misbehave with no console output. The only place an error is logged is in `bindTextInterpolation`, but that catch path is also unreachable because `evaluateExpression` already swallowed the error.

Fix: at minimum `console.warn` the expression and error in the catch. Consider a dev/prod split or a flag.

---

### `new Function` expression evaluator is uncached and blocks JIT
**File:** `src/way.ts` — `evaluateExpression` (~line 783)

A new `Function` object is constructed on every single expression evaluation. `with(data)` also prevents JIT optimisation in V8. Under a large x-for list that re-renders on signal change, this is the hot path.

Fix: cache compiled functions in a `Map<string, Function>` keyed by expression string. The JIT concern requires dropping `with` in favour of explicit parameter destructuring, which is a larger change.

---

### Text interpolation regex breaks on nested braces
**File:** `src/way.ts` — `bindTextInterpolation` (~line 446)

The split regex `/(\{[^{}]*\})/g` only matches single-level braces. Expressions like `{ {a:1}.a }`, `{ items[0]?.['k'] }`, or ternaries with object literals silently break — the regex either misparses or skips the expression.

Fix: replace with a character-level scanner that tracks brace depth, or change the interpolation syntax (README TODO already notes `${...}`).

---

### Signal auto-unwrap is top-level only, creating an inconsistency
**File:** `src/way.ts` — `evaluateExpression` (~line 789)

`evaluateExpression` auto-unwraps signals only when the entire expression result is a signal. So `{x}` works without `.value`, but `{x + 1}` requires `{x.value + 1}` because arithmetic on the raw signal object doesn't unwrap. This inconsistency is not documented and surprises users coming from Vue.

Fix: either document it clearly with examples in the README, or use a `Proxy` around data to auto-unwrap on property access.

---

### `makeObjectReactive` is inconsistent for arrays vs nested objects
**File:** `src/way.ts` — `makeObjectReactive` (~line 641)

Plain objects are recursively reactivised so each leaf property becomes a signal accessed directly. Arrays are wrapped as a *single* signal, so `arr.value` is needed. A user writing `x-comp="{list: [], name: 'foo'}"` gets `{list}` for the count but `{name.value}` never works since `name` is a signal. Actually both need `.value` — but the asymmetry between how you mutate them is undocumented.

Fix: decide on one model and document it. If arrays should also be recursively reactive (each index a signal), implement that. Otherwise add a clear note.

---

## x-for

### Default index key causes full re-render on reorder
**File:** `src/way.ts` — `forLoopDirective` (~line 162)

When `x-key` is absent, the key defaults to `index-${index}`. Reordering the array maps every item to a new key, destroying and recreating all DOM nodes even if the data is unchanged. Users expecting keyed diffing (as in Vue/Alpine) get full re-render silently.

Fix: warn in console when `x-key` is absent on a non-primitive list, and document that `x-key` is required for efficient diffing.

---

### In-place object mutation does not trigger x-for re-render
**File:** `src/way.ts` — `forLoopDirective` (~line 188)

The reuse check is `oldData === newItem.item` (reference equality). If list items are plain objects inside a signal array and a property is mutated in place, the array signal hasn't changed, items haven't changed reference, so the effect doesn't re-run and the DOM is never updated.

Fix: document that list items must be replaced immutably (`list.value = list.value.map(...)`) or make list items signals themselves.

---

## Forms

### `FormData` file inputs serialise to `"[object File]"`
**File:** `src/way.ts` — `formDirective` submit handler (~line 122)

`formData.forEach((value, key) => { formDataObj[key] = value.toString() })` turns every `File` object into the string `"[object File]"`. The custom `onsubmit` event receives useless data for file inputs.

Fix: if file inputs are out of scope, document the limitation. Otherwise pass the raw `FormData` or a mixed `Record<string, string | File>`.

---

### `@onsubmit` attribute lookup uses literal string `"@onsubmit"`
**File:** `src/way.ts` — `formDirective` (~line 118)

`formEl.getAttribute("@onsubmit")` checks for the attribute literally named `@onsubmit` to decide whether to `preventDefault`. However the event listener for `@onsubmit` is bound by the normal `bindEvent` path, and the custom event dispatched with `formEl.dispatchEvent(onsubmit)` bubbles — if a parent also has `@onsubmit`, both fire. The `getAttribute` guard only prevents the default form submit, not double-dispatch.

Verify intended behaviour and document, or isolate the form submit event so it doesn't bubble past the form element.

---

## x-model

### `setTimeout(0)` for select element initial value is a race
**File:** `src/way.ts` — `x-model` directive (~line 44)

The timeout is a workaround for select elements where `<option>` children aren't in the DOM yet. If options are themselves dynamically rendered (via x-for), the timeout may still fire before they're ready, leaving the select unset.

Fix: set the select value in a `requestAnimationFrame` or after the next effect flush, or ensure x-for children are hydrated before x-model resolves.

---

## API / Developer Experience

### No namespace for stores — name collisions with component locals
**File:** `src/way.ts` — `hydrate` (~line 308), `store` (~line 592)

Stores are spread into the root context as flat keys: `{...stores, ...initialContext}`. A component returning a key with the same name silently shadows the store (or vice versa). There is no way to access a store if it is shadowed.

Fix: expose stores under a dedicated namespace, e.g. `$store`, so templates use `{$store.user.id}` and collisions are impossible.

---

### Stores re-merged at every nested `hydrate` call
**File:** `src/way.ts` — `hydrate` (~line 308)

Every call to `hydrate` (including recursive calls from `ifDirective` and `forLoopDirective`) spreads `stores` and `window.pageprops` into a fresh context object. In an x-for with many items this allocates a new merged object per item per render.

Fix: merge stores once at the top-level `render` call and pass the merged root context down; nested `hydrate` calls should accept it directly without re-merging.

---

### `:style` only accepts kebab-case property names
**File:** `src/way.ts` — `bindProperty` (~line 497)

`element.style.setProperty(key, val)` requires CSS kebab-case (`'font-size'`). Vue users expect camelCase (`fontSize`) to also work.

Fix: convert camelCase keys to kebab-case before calling `setProperty`, e.g. `key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())`.

---

### `x-load` forces `display: block`, breaking flex/grid containers
**File:** `src/way.ts` — `x-load` directive (~line 58), README

`x-load` unhides elements with `style.display = "block"`, overriding any CSS `display` value the element should have (flex, grid, inline, etc.). The README warns about this but it remains a footgun.

Fix: instead of setting `display`, remove the `x-load` attribute from the element. The CSS rule `[x-load] { display: none }` then stops applying and the element returns to its natural display value.

---

### `isSignal` duck-typing can false-positive on user objects
**File:** `src/way.ts` — `isSignal` (~line 632)

The check `typeof val.peek === 'function' && 'value' in val` will match any user object that happens to have a `peek` method and a `value` property — for example a range object, a promise wrapper, etc.

Fix: import and use `instanceof Signal` from `@preact/signals-core` if the export is available, or add a known symbol brand to the check.
