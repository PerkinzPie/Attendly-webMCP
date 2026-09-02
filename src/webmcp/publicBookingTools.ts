import type { WebMcpTool } from './browserAdapter'

export type CreateFreeBookingDraftToolInput = {
  readonly eventId: string
  readonly adultTickets: number
  readonly childTickets: number
  readonly guardianName: string
  readonly guardianEmail: string
}

export type ConfirmFreeBookingToolInput = {
  readonly draftId: string
  readonly idempotencyKey: string
}

export type PublicBookingToolHandlers = {
  createFreeBookingDraft(input: CreateFreeBookingDraftToolInput): unknown | Promise<unknown>
  confirmFreeBooking(input: ConfirmFreeBookingToolInput): unknown | Promise<unknown>
}

function stringInput(input: Record<string, unknown>, key: string) {
  return typeof input[key] === 'string' ? input[key] : ''
}

function numberInput(input: Record<string, unknown>, key: string) {
  return typeof input[key] === 'number' ? input[key] : Number.NaN
}

export function createPublicBookingTools(
  eventIds: readonly string[],
  handlers: PublicBookingToolHandlers,
): readonly WebMcpTool[] {
  const writeAnnotations = {
    readOnlyHint: false,
    untrustedContentHint: false,
  } as const

  return [
    {
      name: 'create_free_booking_draft',
      title: 'Create free booking draft',
      description: 'Prepare and display a non-binding free-ticket booking draft for review. Only adult and child quantities plus synthetic guardian contact are accepted; no child identity or health data is accepted.',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            enum: [...eventIds],
            description: 'A published free event identifier returned by search_public_events.',
          },
          adultTickets: {
            type: 'integer',
            minimum: 0,
            maximum: 6,
            description: 'Number of adult or guardian tickets. Include at least one when child tickets are requested.',
          },
          childTickets: {
            type: 'integer',
            minimum: 0,
            maximum: 5,
            description: 'Number of child tickets. Child names, dates of birth, school records and health details are not accepted.',
          },
          guardianName: {
            type: 'string',
            minLength: 1,
            description: 'Synthetic adult or guardian contact name for this demonstration.',
          },
          guardianEmail: {
            type: 'string',
            format: 'email',
            description: 'Synthetic adult or guardian email address for this demonstration.',
          },
        },
        required: ['eventId', 'adultTickets', 'childTickets', 'guardianName', 'guardianEmail'],
        additionalProperties: false,
      },
      annotations: writeAnnotations,
      execute: (input) => handlers.createFreeBookingDraft({
        eventId: stringInput(input, 'eventId'),
        adultTickets: numberInput(input, 'adultTickets'),
        childTickets: numberInput(input, 'childTickets'),
        guardianName: stringInput(input, 'guardianName'),
        guardianEmail: stringInput(input, 'guardianEmail'),
      }),
    },
    {
      name: 'confirm_free_booking',
      title: 'Confirm free booking',
      description: 'Create exactly one free booking from the matching draft visible on the page and return the same booking reference the page displays.',
      inputSchema: {
        type: 'object',
        properties: {
          draftId: {
            type: 'string',
            minLength: 1,
            description: 'The active draft identifier returned by create_free_booking_draft.',
          },
          idempotencyKey: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'A stable unique key for this confirmation attempt so retries cannot duplicate the booking.',
          },
        },
        required: ['draftId', 'idempotencyKey'],
        additionalProperties: false,
      },
      annotations: writeAnnotations,
      execute: (input) => handlers.confirmFreeBooking({
        draftId: stringInput(input, 'draftId'),
        idempotencyKey: stringInput(input, 'idempotencyKey'),
      }),
    },
  ]
}
