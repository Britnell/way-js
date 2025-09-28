# Framework

this is my first own web framework combining all the best of :
- alpine
- web components
- signals

## alpine
obviously this is inspired by alpine. i wanted to combine alpine with web-components for templating / reusability.  I think they are such a great combination.

## web-components
i love alpine, but not having components is such a limiting factor. this framework can be used in 2 ways :
- like alpine, server-render pages and adding some light-weight interactivity on top
- as full spa. with components its powerful enough to build much more complex apps

## signals 
so for fun i built my own alpine, with signals for reactivity, because signals are perfect for this

## todo
- [x] input x-model
- [ ] write comp in `<script>` beside `<template>`
- [ ] x-else-if
- [ ] stores

## future
some current thoughts
- [ ] forms are so important, i want to try adding some helpers for input validation
- [ ] nice fetching hooks like useQuery builtin
- [ ] client side routing / htmx like features or at least work smoothly with ViewTransitions
- [ ] if so, smart prefetching?