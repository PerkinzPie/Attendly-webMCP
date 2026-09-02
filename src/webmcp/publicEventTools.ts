import type { PublicEventAudience } from '../demo/seed'
import type { WebMcpTool } from './browserAdapter'

export type PublicEventSearchToolInput = {
  readonly fromDate?: string
  readonly toDate?: string
  readonly query?: string
  readonly audience?: PublicEventAudience
  readonly age?: number
}

export type PublicEventToolHandlers = {
  searchPublicEvents(input: PublicEventSearchToolInput): unknown | Promise<unknown>
  getPublicEventDetails(eventId: string): unknown | Promise<unknown>
}

function stringInput(input: Record<string, unknown>, key: string) {
  return typeof input[key] === 'string' ? input[key] : ''
}

function optionalString(input: Record<string, unknown>, key: string) {
  const value = stringInput(input, key)
  return value ? { [key]: value } : {}
}

function numberInput(input: Record<string, unknown>, key: string) {
  return typeof input[key] === 'number' ? input[key] : undefined
}

export function createPublicEventTools(
  eventIds: readonly string[],
  handlers: PublicEventToolHandlers,
): readonly WebMcpTool[] {
  const readOnlyAnnotations = {
    readOnlyHint: true,
    untrustedContentHint: false,
  } as const

  return [
    {
      name: 'search_public_events',
      title: 'Search public events',
      description: 'Search published events on the current public page. With no dates it returns upcoming events for the next six months. An optional free-text query matches event, organisation, venue and category names. Suitability matches use only organiser-authored audience and age metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            maxLength: 80,
            description: 'Optional free-text filter matched against event name, organisation name, venue and category, for example "Willowbrook".',
          },
          fromDate: {
            type: 'string',
            format: 'date',
            description: 'Optional inclusive search start date in YYYY-MM-DD format. Defaults to today.',
          },
          toDate: {
            type: 'string',
            format: 'date',
            description: 'Optional inclusive search end date, no more than six calendar months after fromDate. Defaults to six months after fromDate.',
          },
          audience: {
            type: 'string',
            enum: ['adults', 'all-ages', 'children', 'families'],
            description: 'Optional audience filter matched only against organiser-authored event metadata.',
          },
          age: {
            type: 'integer',
            minimum: 0,
            maximum: 17,
            description: 'Optional child age matched only when the organiser supplied a numeric age range.',
          },
        },
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations,
      execute: (input) => handlers.searchPublicEvents({
        ...optionalString(input, 'fromDate'),
        ...optionalString(input, 'toDate'),
        ...optionalString(input, 'query'),
        ...(stringInput(input, 'audience')
          ? { audience: stringInput(input, 'audience') as PublicEventAudience }
          : {}),
        ...(numberInput(input, 'age') === undefined ? {} : { age: numberInput(input, 'age') }),
      }),
    },
    {
      name: 'get_public_event_details',
      title: 'Get public event details',
      description: 'Read current public details, organiser-authored suitability, availability and free-booking rules for an event on the current page. Private attendee and organiser records are never returned.',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            enum: [...eventIds],
            description: 'A stable published event identifier returned by search_public_events on the current page.',
          },
        },
        required: ['eventId'],
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations,
      execute: (input) => handlers.getPublicEventDetails(stringInput(input, 'eventId')),
    },
  ]
}
