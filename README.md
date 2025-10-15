# Way.js

A reactive web framework combining the best of Signals, Web Components and HTML.

## Installation

```bash
npm install way
```

## Quick Start

```typescript
import way from "way";

// Define a component
way.comp("x-counter", ({ props }) => {
  const count = way.signal(props.start ?? 0);

  const increment = () => count.value++;

  return { count, increment };
});
```

```html
<!-- define markup -->
<template id="x-counter">
  <p>Count: <span x-text="count"></span></p>
  <button @click="increment">+1</button>
</template>

<!-- use as component -->
<div id="app">
  <x-counter x-props="{start: 5}"></x-counter>
</div>
```

## Features

- **Alpine.js-like directives** - Add interactivity directly in HTML
- **Web Components** - Native reusable components with props
- **Signals** - Fine-grained reactivity using @preact/signals-core
- **Form validation** - Built-in form handling with Valibot schemas
- **TypeScript support** - Full TypeScript support with distributed source files

## Directives

### Text Binding

```html
<span x-text="message"></span>
```

### Conditional Rendering

```html
<template x-if="showContent">
  <div>Content here</div>
</template>

<template x-else-if="showAlternative">
  <div>Alternative content</div>
</template>

<template x-else>
  <div>Fallback content</div>
</template>
```

### List Rendering

```html
<template x-for="item in items">
  <div x-text="item.name"></div>
</template>
```

### Two-way Binding

```html
<input x-model="username" type="text" />
```

### Event Handling

```html
<button @click="handleClick">Click me</button>
<button @click.outside="handleOutsideClick">Click outside</button>
```

### Property Binding

```html
<div :class="{ active: isActive }"></div>
<div :style="{ color: 'red' }"></div>
```

## Forms

```typescript
import { object, string } from "valibot";

way.form(
  "contact",
  {
    name: string(),
    email: string(),
  },
  (event, data) => {
    console.log("Form submitted:", data);
  }
);
```

```html
<form x-form="contact">
  <input name="name" type="text" />
  <input name="email" type="email" />
  <button type="submit">Submit</button>
</form>
```

## Stores

```typescript
way.store("cart", () => {
  const items = way.signal([]);

  const addItem = (item) => {
    items.value = [...items.value, item];
  };

  return { items, addItem };
});
```

## API Reference

### way.comp(tag, setup)

Define a reusable component.

### way.render(root, initial?)

Render the framework on a DOM element.

### way.form(name, fields, onSubmit?)

Define a form validation schema.

### way.store(name, setup)

Create a global store.

### way.signal(initial)

Create a reactive signal.

### way.effect(fn)

Create an effect that runs when dependencies change.

### way.computed(fn)

Create a computed signal.

## License

MIT

# Framework

this is my first own web framework combining all the best of :

- alpine
- web components
- signals

# WHY!?!??!

yes ... well. i love alpine - sprinkling interactivity through html attributes is the way. I think we've lost the way with jsx, and need to get back, and closer to html & the dom.

**jsx was a mistake.** why are we inventing a new language, that needs an extra compile step, just to emulate html so your app code can attach to it?
Vue already does so much in attributes `v-if` to `:class`, the question really is, why can't we use html?

Alpine was genius to take this same system, bundle it in a super light framework and let us use those **directives** straight in html.
But it doesn't scale nicely to building larger, more complex apps, i wanted templating & reusable components.

**Web components** are the perfect fit - already built-in and html native. write `<my-counter />` just like you're used to with other frameworks. feels like jsx, but isnt.
I tried building this by extending alpine with custom directives etc. but couldn't make it work really, let alone make it work nicely.

So then i thought of **signals**, its fine-grained reactivity is perfect for updating specific elements & their attributes. so i started building my own version of alpine with signals.

The important part for reusable components is passing **props**, which finally lead me to define components similar to `Alpine.data` but with a **setup** function, that should feel familiar

```
<div id="app">
    <h1>Counter</h1>
    <x-counter x-props="{start: count}"></x-counter>
</div>

<template id="x-counter">
    <p>the count is
        <span x-text="x"></span>
    </p>
    <button @click="incr">+1</button>
</template>

<script>
way.component('x-counter', ({ props }) => {
  const x = signal(props.start);
  const double = computed(() => count.value * 2);

  const incr = () => x.value++;

  effect(() => {
    console.log('props changed: ', props.start);
  });

  return { x, double, incr };
});
</script>

```

**first class forms** - why cant we jsut server render everything? forms are a big part of this. we want validation & error messages. so i added an 'x-form' directive inspired by vee-validate, just give it a **zod schema** and it will do the work for you.

**Bottom line** this should look and feel a lot like vue3. really just without the jsx. write html again, your markup is your markup, your js is the interactivity that hides & shows certain elements.

# todo

- [x] input x-model
- [x] write comp in `<script>` beside `<template>`
- [x] hide #app before webComp loaded (x-load)
- [x] string {template}
- [x] x-else-if
- [x] x-template
- [x] comp without setup function (props)=>props
- [x] @click.outside.prevent
- [x] stores
- [x] component onMount
- [x] useQuery (@preact-signals/query)
- [x] components get (el)=> ref
- [x] forms - some easyinput validations
- [x] replace zod with valibot
- [ ] turbolinks
- [ ] view transitions compatibility
- [ ] intersection api
- [ ] scroll animations
- [ ] pageload
- [ ] data fetching hooks like useQuery ?

## bummers / open questions

- [ ] i tried unwrapping all signals so dont have to use signal.value inside html attributes, but there was some issues
- [ ] maybe forms should have more features and be separate package

- view transitions https://developer.chrome.com/docs/web-platform/view-transitions

# turbo links

### rel=prefetch

https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/prefetch

is used for same-site navigation resources, user is likely to need the target resource for future navigations

<link rel="prefetch"> is functionally equivalent to a fetch() call with a priority: "low"

### speculation rules

https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API
https://developer.chrome.com/docs/web-platform/implementing-speculation-rules

# browser signals

https://github.com/proposal-signals/signal-polyfill
