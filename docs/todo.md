# Todos

---

## Reactivity / Evaluator

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

### Document the immutable update contract for x-for lists
**File:** `src/way.ts` — `forLoopDirective` (~line 188); README x-for section

The framework requires immutable list updates to trigger re-renders — the `todo.html` example consistently uses `list.value = list.value.map(...)` and `list.value = [...list.value, newItem]`. This works because the x-for effect re-runs when the array signal's value changes. In-place mutation (e.g. `list.value.push(x)` or `list.value[0].name = 'x'`) does not reassign the signal and so the DOM never updates.

Fix: document this contract explicitly in the README x-for section with a correct and an incorrect example. No code change needed.

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
