# AGENTS.md

## npm scripts

- `npm run bundle` - build framework.ts into framework.min.js
- Don't run `npm run dev` i already have a dev server running and am testing the app

## Code Style Guidelines

### TypeScript Configuration

- Use `way.signal<T>()` for reactive state

### Framework Patterns

- Define components with `way.comp(tag, setup)`
- Use `x-props` for component props, `x-comp` for inline data
- Form validation with `way.form(name, schema, setup)`
- `way.render(root)` is called once in main.js
