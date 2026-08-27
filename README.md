# Attendly-webMCP

A standalone Attendly demonstration for the [OpenAI WebMCP
Challenge](https://openai.com/webmcp-challenge/).

> [!IMPORTANT]
> This repository is an independently built competition project. It contains
> no source code, credentials or customer data from the existing Attendly
> platform. Every event and person is synthetic.

## What it demonstrates

Attendly-webMCP explores how a website can expose structured, page-specific
tools to an AI agent while keeping the human interface visible and in control.

The scoped journeys cover:

- guest event discovery and reviewable free-ticket booking;
- organiser event creation, attendance and check-in workflows; and
- evacuation accountability using careful, non-certifying terminology.

The current application presents a realistic public organisation hub with
searchable events, category filters, event detail and a reviewable free-ticket
booking journey. It uses the established Attendly visual identity while all
organisation, event and booking data remains deterministic and synthetic.
WebMCP tools will be added in subsequent stories.

## Run locally

### Prerequisites

- Node.js 24 or newer
- pnpm 11 or newer

```sh
git clone https://github.com/PerkinzPie/Attendly-webMCP.git
cd Attendly-webMCP
pnpm install
pnpm dev
```

Vite will print the local development URL, normally
`http://localhost:5173`.

## Required checks

Run the complete verification suite before opening a pull request:

```sh
pnpm check
```

Or run an individual command:

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Static lint checks |
| `pnpm typecheck` | TypeScript validation |
| `pnpm test` | Deterministic automated tests |
| `pnpm build` | Production build |
| `pnpm preview` | Preview the production output locally |

## Project structure

```text
src/
├── demo/        Synthetic seed data
├── test/        Shared test setup
├── App.tsx      Event discovery and booking experience
└── main.tsx     Browser entry point
```

The Attendly wordmark, icon and typefaces in `public/` are authorised brand
assets. No existing Attendly application source code is included.

## Data and safety boundaries

- Do not import or copy code from the private Attendly platform.
- Do not use real attendee, school, venue or customer information.
- Keep WebMCP write actions narrow, reviewable and auditable.
- Describe evacuation records as **accounted for** or **unconfirmed**; never
  infer that a person is safe, missing or inside a building.
- Do not represent this demonstration as a certified life-safety system.

## Competition resources

- [Challenge overview](https://openai.com/webmcp-challenge/)
- [Official rules](https://webmcp.devpost.com/rules)
- [OpenAI WebMCP guide](https://learn.chatgpt.com/docs/webmcp)
