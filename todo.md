# Todo

## Memory Leak in Directives

There is a potential memory leak in directives that use `effect` (like `x-text`, `x-show`, `:class`, etc.). The `effect` function returns a cleanup function that should be called when the element is removed from the DOM.

Currently, these cleanup functions are not being stored or called, which can lead to effects persisting in memory after their associated elements are gone.

This should be addressed by creating a mechanism to collect all cleanup functions during `hydrate` and storing them on the element or in a map, to be called when the element is destroyed (e.g., removed by an `x-for` or `x-if`).
