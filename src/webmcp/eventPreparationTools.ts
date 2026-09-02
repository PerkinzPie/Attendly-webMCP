import type { EventDraftInput } from '../domain/eventOperations'
import type { WebMcpTool } from './browserAdapter'

export type ManagedEventToolRecord = {
  readonly id: string
  readonly organisationId: string
  readonly organisationName: string
  readonly organisationLocation: string
  readonly name: string
  readonly startsAt: string
  readonly venue: string
  readonly capacity: number
  readonly state: string
}

export type EventPreparationToolHandlers = {
  listEvents(): unknown
  createEventDraft(input: EventDraftInput): unknown
  confirmEventCreation(draftId: string): unknown
}

function asEventDraftInput(input: Record<string, unknown>): EventDraftInput {
  return {
    organisationId: typeof input.organisationId === 'string' ? input.organisationId : '',
    name: typeof input.name === 'string' ? input.name : '',
    startsAt: typeof input.startsAt === 'string' ? input.startsAt : '',
    venue: typeof input.venue === 'string' ? input.venue : '',
    capacity: typeof input.capacity === 'number' ? input.capacity : Number.NaN,
  }
}

export function createEventPreparationTools(
  handlers: EventPreparationToolHandlers,
  organisationIds: readonly string[],
): readonly WebMcpTool[] {
  return [
    {
      name: 'list_events',
      title: 'List events',
      description: 'Read the events currently available to the organiser, including each event identifier, organisation, location, venue, date, capacity and state. This does not change event data.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
      execute: () => handlers.listEvents(),
    },
    {
      name: 'create_event_draft',
      title: 'Create event draft',
      description: 'Prepare and display a reviewable event draft for an organisation. This does not create or persist an event.',
      inputSchema: {
        type: 'object',
        properties: {
          organisationId: {
            type: 'string',
            enum: [...organisationIds],
            description: 'The organisation that will own the event.',
          },
          name: { type: 'string', minLength: 1, description: 'The event name.' },
          startsAt: { type: 'string', format: 'date-time', description: 'The event start time in ISO 8601 format.' },
          venue: { type: 'string', minLength: 1, description: 'The event venue.' },
          capacity: { type: 'integer', minimum: 1, description: 'The maximum number of attendees.' },
        },
        required: ['organisationId', 'name', 'startsAt', 'venue', 'capacity'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
      },
      execute: (input) => handlers.createEventDraft(asEventDraftInput(input)),
    },
    {
      name: 'confirm_event_creation',
      title: 'Confirm event creation',
      description: 'Create the event from the matching draft currently visible on the Events page. Persists exactly one event and displays it in the list.',
      inputSchema: {
        type: 'object',
        properties: {
          draftId: {
            type: 'string',
            minLength: 1,
            description: 'The identifier returned by create_event_draft for the visible draft.',
          },
        },
        required: ['draftId'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
      },
      execute: (input) => handlers.confirmEventCreation(typeof input.draftId === 'string' ? input.draftId : ''),
    },
  ]
}
