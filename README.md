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
    <div x-data="{xstart: 123}">
        <h1>Counter</h1>
        <my-counter x-props="{xstart: count}" ></my-counter>
    </div>
</div>

<template id="my-counter">
    <p>the count is 
        <span x-text="x"></span>
    </p>
    <button @click="incr">+1</button>
</template>

<script>
Framework.component('my-counter', ({ props }) => {
  const x = signal(props.xstart);
  const double = computed(() => count.value * 2);

  const incr = () => x.value++;
  
  effect(() => {
    console.log('props changed: ', props.xstart);
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
- [ ] @click.outside.prevent
- [x] stores
- [x] component onMount
- [x] useQuery  (@preact-signals/query)
- [x] components get (el)=> ref
- [x] forms - some easyinput validations
- [ ] forms - conditional logic to hide inputs / sections ? form , on update callback, (form,el)=> then just get by name/id
- [ ] turbolinks
- [ ] view transitions compatibility
- [ ] intersection api
- [ ] scroll animations
- [ ] pageload
- [ ] data fetching hooks like useQuery ?

## bummers / open questions
- [ ] i tried unwrapping all signals so dont have to use signal.value inside html attributes, but there was some issues

