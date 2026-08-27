# Repository Guidelines

## Project Structure & Module Organization

Attendly-webMCP is a standalone React 19, TypeScript, and Vite application. Keep application code in `src/`: `App.tsx` owns the current event-discovery and booking experience, `demo/seed.ts` contains deterministic synthetic data, and `test/setup.ts` configures shared test behaviour. Co-locate focused tests with their subject, using names such as `App.test.tsx`. Static brand assets, icons, and fonts belong in `public/`; CI configuration lives in `.github/workflows/ci.yml`.

Prefer small components and shared domain functions when behaviour must be available to both the visible interface and future WebMCP tools. Do not duplicate booking or event rules inside tool handlers.

## Build, Test, and Development Commands

- `pnpm install --frozen-lockfile` installs the exact locked dependency set.
- `pnpm dev` starts the Vite development server.
- `pnpm test` runs the Vitest suite once; `pnpm test:watch` supports local iteration.
- `pnpm lint` runs Oxlint; `pnpm typecheck` validates all TypeScript projects.
- `pnpm build` creates the production bundle in `dist/`.
- `pnpm check` runs linting, type checking, tests, and the production build. Run it before every pull request.

Use Node.js 24+ and pnpm 11+ as declared in `package.json`.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, single quotes, no semicolons, and trailing commas in multiline structures. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and descriptive file names such as `seed.ts` or `App.test.tsx`. Keep UI copy in British English. Use semantic HTML and accessible role, label, and focus behaviour. Oxlint is authoritative for static style checks.

## Testing Guidelines

Tests use Vitest, jsdom, and Testing Library. Exercise user-visible behaviour through accessible queries instead of component internals. Add tests for search/filter changes, review steps, confirmations, and failure or empty states affected by a change. No numeric coverage threshold is enforced; meaningful coverage of changed behaviour is required.

## Commit & Pull Request Guidelines

Use Conventional Commits, matching repository history: `feat: add event search tool`, `fix: preserve booking review state`, or `test: cover empty results`. Keep commits focused. Pull requests should explain the user outcome, link the relevant Linear issue, list validation performed, and include desktop/mobile screenshots for visible changes.

After completing and validating each user story, create its focused Conventional Commit. Include the full Linear story URL in the commit body or footer as a reference.

## Security & Data Boundaries

Never copy private Attendly source, customer records, credentials, or production endpoints. All committed organisations, people, bookings, and events must be clearly synthetic. Put configuration examples in `.env.example`; never commit live secrets.
