# Way.js

A reactive web framework combining the best of HTML, Signals, and Web Components.

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

- **HTML first** - Write vanilla HTML again, no JSX, no virtual DOM
- **Alpine.js-like directives** - Add interactivity directly in HTML attributes
- **Web Components** - Native reusable components with props
- **Signals** - Fine-grained reactivity for efficient DOM updates
- **Form validation** - Built-in form handling with Valibot schemas
- **TypeScript support** - Full TypeScript support with distributed source files
- **View Transitions** - Build smooth MPAs that feel like SPAs

## Philosophy

### Look Mum, no JSX!

I think these 3 technologies go so well together - as minimal as possible with all the power of a full framework.

**HTML first** - Just write HTML again, no JSX, no virtual DOM. What you see is what you get. The framework just attaches itself to the DOM via custom HTML attributes. Write vanilla HTML & JS again, and work directly with the actual DOM.

**Web Components** - But we still want components, they are such a powerful way to compose your page or app. Write function components, and use them by their name like you would in JSX. Web components already let us do that. Pass in props etc. just like in any JS framework.

**Signals** - But web components alone don't have any reactivity. With signals we get fine-grained reactivity, and can update just the relevant DOM nodes and their attributes.

**DOM** - All state is automatically available to all child nodes, just like CSS variables, while custom events bubble up the DOM tree. Forget about prop drilling and passing callbacks around, use the DOM!

### Why Another Framework?

**JSX was a mistake.** Why are we inventing a new language that needs an extra compile step, just to emulate HTML so your app code can attach to it? Vue already does so much in attributes like `v-if` to `:class`, the question really is, why can't we use HTML?

Alpine was genius to take this same system, bundle it in a super light framework and let us use those directives straight in HTML. But it doesn't scale nicely to building larger, more complex apps - I wanted templating & reusable components.

Web components are the perfect fit - already built-in and HTML native. Write `<my-counter />` just like you're used to with other frameworks. It feels like JSX, but it isn't.

So I thought of signals - their fine-grained reactivity is perfect for updating specific elements & their attributes. I started building my own version of Alpine with signals.

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

## Components

### Basic Component

```html
<div id="app">
  <h1>Counter</h1>
  <x-counter x-props="{start: count}"></x-counter>
</div>

<template id="x-counter">
  <p>the count is: <span x-text="count"></span></p>
  <button @click="incr">+1</button>
</template>

<script>
way.comp('x-counter', ({ props }) => {
  const count = way.signal(props.start);
  const double = way.computed(() => count.value * 2);

  const incr = () => count.value++;

  way.effect(() => {
    console.log('props changed: ', props.start);
  });

  return { count, double, incr };
});
</script>
```

### Props Example

```html
<div x-comp="x-counter">
  <p>
    Counter: {count}
    <button @click="count.value++" class="border ml-6">+1</button>
  </p>

  <count-down x-props="{start: count}"></count-down>
</div>

<template id="count-down">
  <p>Countdown: {countdown}</p>
</template>

<script>
way.comp("count-down", ({ props }) => {
  const countdown = way.signal(props.start?.value);
  let interval;

  way.effect(() => {
    countdown.value = props.start?.value;
    const runcountdown = () => {
      if (countdown.value > 0) countdown.value -= 1;
      else clearInterval(interval);
    };

    if (interval) clearInterval(interval);
    interval = setInterval(runcountdown, 300);
  });
  return { countdown };
});
</script>
```

## Forms

Input and form validation is one of the main reasons that client-side interactivity is needed. This is built right into the framework. The error is automatically shown in the related aria-describedby element if there is one.

```typescript
import * as v from "valibot";

way.form(
  "login",
  {
    name: v.pipe(v.string(), v.minLength(1, "Name is required")),
    password: v.pipe(
      v.string(),
      v.minLength(4, "Password is too short"),
      v.maxLength(10, "Password is too long"),
      v.regex(/\d/, "Password must include at least one digit")
    ),
  },
  () => {
    const data = way.signal(null);
    const name = way.signal("");

    return {
      name,
      data,
      onsubmit: (ev: CustomEvent) => {
        console.log(ev.detail);
        data.value = ev.detail;
      },
    };
  }
);
```

```html
<form x-form="login" class="space-y-3" @onsubmit="onsubmit($event)">
  <label>
    Name:
    <input
      x-model="name"
      name="name"
      aria-describedby="nameerror"
      class="block border"
    />
  </label>
  <p id="nameerror" class="text-red-400"></p>

  <label>
    password:
    <input
      name="password"
      aria-describedby="passworderror"
      class="block border"
    />
  </label>
  <p id="passworderror" class="text-red-400"></p>
  <button>Submit</button>
  <p x-show="data.value">
    Hi {data.value.name} <br />
    secret: "{data.value.password}"
  </p>
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

## View Transitions

With ViewTransitions coming to Firefox your MPA feels like an SPA. Make your routes even faster with new speculation rules and a polyfill - our extra library.

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

## Web Platform & HTML First

Frameworks should be compatible with HTML, vanilla JS & web-components, so we can stop vendor lock-in. You shouldn't be stuck with a framework because of a component library. All libraries should be compatible with your stack, why are we rebuilding the same features in each framework?

## License

MIT
