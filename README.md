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

The application presents a realistic public directory where organisations are
the primary entities and each organisation owns its upcoming events. Six
synthetic schools, PTAs, churches, venues, charities and clubs host 18
searchable events. Visitors can open an organisation, filter its events, view
event details and complete a reviewable free-ticket booking journey.
Organisers can open an event control room to check attendees in, review
attendance anomalies and run an evacuation roll call. The site uses the
established Attendly visual identity while all organisation, event and booking
data remains deterministic and synthetic.

## Live demo

The production build is published at
**<https://attendly-webmcp.pages.dev/>**.

Confirmed organiser-created events and confirmed free bookings are stored in
Cloudflare D1 and shared between ChatGPT and ordinary browser sessions. A
booking made on one device appears as a registered attendee on the event's
page in the Events workspace from any other device, and counts against the
event's availability everywhere. Operational rehearsal state, including
check-ins and roll calls, remains in the browser's local storage so each
visitor gets an isolated copy of that synthetic scenario. The **Reset demo**
button resets that local rehearsal state; it does not delete confirmed events
or bookings from shared storage.

## WebMCP site tools

Tools are registered through `document.modelContext.registerTool` and are
scoped to the visible page. Leaving a page removes its tools. In a browser
without WebMCP support every journey still works and a short compatibility
notice is shown.

| Page | Tool | Effect |
| --- | --- | --- |
| Public events | `search_public_events` | Read. Upcoming published events, optional free-text query, audience, age and date range |
| Public events | `get_public_event_details` | Read. Public details, suitability and booking rules for one event |
| Public events | `create_free_booking_draft` | Write. Renders a reviewable free-ticket draft; nothing is persisted |
| Public events | `confirm_free_booking` | Write, confirmed. Creates one booking from the visible draft |
| Organiser events | `list_events` | Read. Events the organiser manages |
| Organiser events | `create_event_draft` | Write. Renders a reviewable event draft |
| Organiser events | `confirm_event_creation` | Write, confirmed. Creates the drafted event |
| Event control room | `get_event_snapshot` | Read. Live totals, revision and anomalies for the open event |
| Event control room | `find_attendee` | Read. Attendee search with grouped registrations |
| Event control room | `get_attendance_anomalies` | Read. Capacity risk and duplicate-registration candidates |
| Event control room | `check_in_attendee` | Write, confirmed. Checks in one registered attendee |
| Event control room | `start_evacuation_accountability` | Write, confirmed. Starts a roll call for checked-in attendees |
| Event control room | `get_unconfirmed_attendees` | Read. Attendees not yet accounted for in the active roll call |
| Event control room | `record_accountability_status` | Write, confirmed. Marks one attendee accounted for or unconfirmed |
| Event control room | `generate_incident_summary` | Read. Factual roll-call summary without inferring physical safety |
| Event control room | `close_evacuation_accountability` | Write, confirmed. Closes the roll call and records the closure |

Every write tool is `readOnlyHint: false`, names its side effect in its
description so the agent's normal confirmation policy applies, and returns
the same data the interface displays.

The seed module also provides a reset-ready operations scenario for the
synthetic “Riverside Community Workshop”: capacity 20, 16 registrations, 13
initial check-ins, and fixed exception and anomaly records for rehearsal.

### Testing in ChatGPT

ChatGPT discovers site tools only in the built-in browser of the ChatGPT
desktop app, following the [OpenAI WebMCP guide](https://learn.chatgpt.com/docs/webmcp).
If the tools do not appear:

1. Open the site in the ChatGPT desktop app's browser, not in ChatGPT on the
   web or in another browser.
2. Turn on **Enable site tools** under **Settings > Browser > Permissions**.
3. Pick a model that supports WebMCP. The guide lists GPT-5.6 Sol and Terra;
   Luna has site tools disabled, and Enterprise and Edu workspaces cannot use
   them.
4. Select **Site tools** in the address bar and choose **Available site
   tools**. The public events page registers four tools, the organiser events
   page three, and an event control room nine.

The page footer reports what it sees. "Site tools require a WebMCP-enabled
browser." means the browser never exposed `document.modelContext`. "Site tools
could not be registered" shows the error the browser returned, which is also
written to the console with a `WebMCP:` prefix.

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
| `pnpm dev:pages` | Build and run the site, Pages Function and local D1 together |
| `pnpm db:migrate:local` | Apply pending migrations to local D1 storage |
| `pnpm db:migrate:remote` | Apply pending migrations to production D1 storage |
| `pnpm deploy` | Run all checks, then publish `dist/` to Cloudflare Pages |

## Deployment

The site is a React single-page application deployed to Cloudflare Pages. A
same-origin Pages Functions expose `/api/events` and `/api/bookings`, backed
by the `attendly-webmcp-db` D1 database. The visible booking flow, the event
workspace and the WebMCP tools all use those endpoints, so a confirmed event
or booking is visible from a different browser session. The bookings endpoint
applies the same free-booking rules as the page and enforces capacity inside
the insert itself, so simultaneous confirmations cannot overbook an event.

```sh
wrangler login             # once, on your machine
pnpm db:migrate:local      # once, then whenever migrations change
pnpm dev:pages             # local site and D1-backed API
pnpm deploy                # checks, production migrations and Pages deploy
```

`wrangler.jsonc` names the Pages project (`attendly-webmcp`), the build output
directory and the D1 binding. The GitHub Actions **Deploy** workflow applies
pending D1 migrations before publishing on every push to `main` when the
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets are
configured; without them the workflow skips deployment and the last published
release stays live.

## Project structure

```text
functions/
├── api/events.ts   Shared confirmed-event API backed by D1
└── api/bookings.ts Shared confirmed-booking API backed by D1
migrations/      Versioned D1 schema migrations
src/
├── application/ Shared services used by the UI and the WebMCP tools
├── demo/        Synthetic seed data
├── domain/      Event, attendance and accountability rules
├── test/        Shared test setup
├── webmcp/      Page-scoped tool contracts and the browser adapter
├── App.tsx      Public directory, organiser events and control room
└── main.tsx     Browser entry point
```

The concise [shared UI and WebMCP boundaries](docs/adr/0001-shared-webmcp-boundaries.md)
record the durable constraints for subsequent stories while leaving datastore,
hosting and protocol choices to their implementation work.

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
