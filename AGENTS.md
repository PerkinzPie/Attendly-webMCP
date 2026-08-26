# Attendly-webMCP contributor guidance

## Project boundary

This is a standalone, public competition project. Do not copy source code,
credentials, customer records or private endpoints from the existing Attendly
platform.

All people, organisations and events committed to this repository must be
clearly synthetic.

## Required checks

Before considering a change complete, run:

```sh
pnpm check
```

Prefer shared domain/application services for behaviour that will be available
through both the human interface and WebMCP tools.
