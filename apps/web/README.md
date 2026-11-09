# React + TypeScript + Vite

PortPower dashboards: `/` redirects to `/gulfport`; `/gulfport` and `/miami`
use the shared region-specific fleet dashboard. `/vessels/:mmsi` retains vessel
intelligence and historical movement. Port switches reset dashboard state and
cancel pending requests. Each dashboard also checks coordinates against the
backend monitoring rectangle before showing observations.

From `apps/web`, run `npm run dev`, `npm run build`, or `npm test`.
Tests use Node's built-in test runner and TypeScript stripping (Node 22.6+).
The Vite development server proxies `/api` to `http://localhost:3000`.
Production hosting must forward `/api` to the vessel backend and serve
`index.html` for client routes such as `/miami` and `/vessels/:mmsi`.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
