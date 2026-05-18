# Todos

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

### `x-load` forces `display: block`, breaking flex/grid containers
**File:** `src/way.ts` — `x-load` directive (~line 58), README

`x-load` unhides elements with `style.display = "block"`, overriding any CSS `display` value the element should have (flex, grid, inline, etc.). The README warns about this but it remains a footgun.

Fix: instead of setting `display`, remove the `x-load` attribute from the element. The CSS rule `[x-load] { display: none }` then stops applying and the element returns to its natural display value.

---

### `isSignal` duck-typing can false-positive on user objects
**File:** `src/way.ts` — `isSignal` (~line 632)

The check `typeof val.peek === 'function' && 'value' in val` will match any user object that happens to have a `peek` method and a `value` property — for example a range object, a promise wrapper, etc.

Fix: import and use `instanceof Signal` from `@preact/signals-core` if the export is available, or add a known symbol brand to the check.
