# Way.js

A reactive web framework combining the best of HTML, Signals, and Web Components.

- [Website](https://britnell.github.io/way-js/)
- [git](https://github.com/Britnell/way-js)
- [npm](https://www.npmjs.com/package/wayy)

## Get-started

[Vite-way-starter](https://github.com/Britnell/way-vite-starter/tree/main)

### Basic usage

```html
<head>
  ...
  <script type="module" src="/main.ts"></script>
  <script src="/way-inline.js"></script>
</head>
<body>
  <div id="app">
    <h1>Counter</h1>
    <x-counter x-props="{start:3}"></x-counter>
  </div>
  <template id="x-counter">
    <p>The count is {x}</p>
    <p>{x} x 2 = {double}</p>
    <button @click="add()">+1</button>
  </template>
  <script>
    way.comp("x-counter", ({ props }) => {
      const x = way.signal(props.start ?? 0);
      const double = way.computed(() => x.value * 2);
      return {
        x,
        double,
        add: () => (x.value += 1),
      };
    });
  </script>
</body>

<!-- main.ts -->
<script>
  import way from "wayy";

  way.comp('other',()=>{...})

  way.render(document.body);
</script>
```

- to work with typescript and write larger logic in ts modules, import the lib in your main script
- in order to use way.comp in inline script tags, also load 'way-inline.js' (found in npm package)
- define logic with way.comp() and setup function
- use on html element with x-comp. everything returned but the comp setup function will be available to use in dynamic attributes

read more on [dynamic attributes & directives here](#directives).

## components

define components with the setup function `way.comp('my-name',(props)=>{...})`
The name will be used for the web-component, so it needs to have a hyphen in it.
Define the markup for the component on a template with that id :
`<template id="my-name">`

then use anywhere in your html as `<my-name x-props="{}"></my-name>`

You can pass in static values and other signals as props, if the component needs to react to other components.

### logic only

but components are flexible. if you dont want a full component you can also just apply it to any html element with x-comp (very much like alpine x-data).

```html
<div x-comp="x-counter" x-props="{start: 100}">
  X =  {x}
  <button @click="add()">add</button>
</x-counter>
```

## Attributes and Directives

So we have our signals in state, how do we use them? so this is mostly like vue and alpine.

show values with
`x = <span x-text="x"></span>`
or just text interpolation
`x = {x}`

### Text Binding

```html
<span x-text="message"></span>
```

### Attributes

just like in vue, set any attribute dynamically with :attr="expression"
`<div :class="x.value%2===0 ? 'odd' : 'even' " :style="{'font-size': x.value + 'px' }" >`

### `x-show` and `x-if`

#### x-show

will automatically hide an element for you with `display: none / block;`
it's more handy for day-to-day stuffs were hiding and showing

#### x-if

must be used with template tags, and only adds the elements to the dom when condition is true.
use this for elements you dont want to render or even logic that might break when an element not defined or so.

```html
<p x-show="list.value.length===0">List is empty!</p>
<p x-else>{list.value.length} results</p>

<template x-if="x.value % 2===0">
  <p>Even</p>
</template>
<template x-else-if="x.value < 0">
  <p>negative</p>
</template>
<template x-else>
  <p>a number</p>
</template>
```

### x-for

jsut like vue / alpine `x-for`

```html
<template x-for="item in items">
  <div x-text="item.name"></div>
</template>
```

### x-load

the first loaded html before hydration can look janky :

- web components will be empty
- and text {x} interpolation will not be done yet

to avoid this you can put `x-load` on your app root, or further up in the html (or on multiple elements). use css to hide these,

```
[x-load] {
  display: none;
}
```

then during hydration wayy will unhide all these elements with `style="display: block;"`. so no grid of flex on these.

### Bind a signal to an input

Binds the input.value to the signal. This handles different input types like checkbox where it el.checked not el.value

```html
<input x-model="username" type="text" />
```

### Event Handling

listen for dom events or custom events, just like in vue.

```html
<button @click="handleClick">Click me</button>
<button @click.outside="handleOutsideClick">Click outside</button>
```

Component setup functions receive an emit helper to emit custom events with event.detail

```typescript
way.comp("submitbutton", ({ emit }) => {
  return {
    onclick: () => {
      emit("submitted", { values: [] });
    },
  };
});
```

## Forms

Input and form validation is one of the main reasons that client-side interactivity is needed. This is built right into the framework. Validate form values with `valibot` schema, this was chosen because other packages like zod are HUGE! The error is automatically shown in the related aria-describedby element if there is one.

it will submit the default form submit event, or if you add an @onsubmit event listener, then **the default submit event will be prevented** and 'onsubmit' custom event is emitted with values neatly in object.

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
</form>
```

## Stores

Stores are really identical to a comp with logic, `way.comp('data')`, but they are applied to the app root, so the entire app has access to them, and also they dont need to (and shouldn't) be applied to any dom node.

```typescript
way.store("user", () => {
  const id = way.signal("abc");

  return { id, version: 0.123 };
});
```

currently need to use theme variables via
`<p>userid : {user.id}</p>

## MPA

built to be compatible with browser native ViewTransitions.
also working on an extra turbo.ts script to make MPAs faster with prefetching links on hover

- using new 'speculationRules'
- as backup `<link rel='prefetch' `
- and for safari which doesnt support neither of those with manual prefetching with `fetch()`

## API Reference

### way.comp(tag, setup)

Define a reusable component.

### way.store(name, setup)

Create a global store.

### way.render(root, initial?)

Hydrate the DOM and render the app

### way.form(name, fields, onSubmit?)

Define a form validation schema.

### Signals

the usual :

- way.signal
- way.computed
- way.effect

# TODOS

- [ ] host way.min on unpckg or so
- [ ] rewrite x-for
- [ ] x-form directive as separate script / plugin
