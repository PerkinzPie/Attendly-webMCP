import type { WebMcpTool } from './browserAdapter'

export type RecordAccountabilityStatusToolInput = {
  readonly eventId: string
  readonly attendeeId: string
  readonly status: string
  readonly note: string
}

export type AccountabilityToolHandlers = {
  startAccountability(eventId: string): unknown | Promise<unknown>
  getUnconfirmedAttendees(eventId: string): unknown | Promise<unknown>
  recordAccountabilityStatus(input: RecordAccountabilityStatusToolInput): unknown | Promise<unknown>
  generateIncidentSummary(eventId: string): unknown | Promise<unknown>
  closeAccountability(eventId: string): unknown | Promise<unknown>
}

function stringInput(input: Record<string, unknown>, key: string) {
  return typeof input[key] === 'string' ? input[key] : ''
}

function eventIdSchema(activeEventId: string) {
  return {
    type: 'string',
    const: activeEventId,
    description: 'The event currently open in event management.',
  }
}

export function createAccountabilityTools(
  activeEventId: string,
  handlers: AccountabilityToolHandlers,
): readonly WebMcpTool[] {
  const eventInputSchema = {
    type: 'object',
    properties: { eventId: eventIdSchema(activeEventId) },
    required: ['eventId'],
    additionalProperties: false,
  }
  const readOnlyAnnotations = {
    readOnlyHint: true,
    untrustedContentHint: false,
  } as const
  const writeAnnotations = {
    readOnlyHint: false,
    untrustedContentHint: false,
  } as const

  return [
    {
      name: 'start_evacuation_accountability',
      title: 'Start evacuation accountability',
      description: 'Start one audited accountability session (roll call) for the checked-in attendees of the active event. Fails if a session already exists.',
      inputSchema: eventInputSchema,
      annotations: writeAnnotations,
      execute: (input) => handlers.startAccountability(stringInput(input, 'eventId')),
    },
    {
      name: 'get_unconfirmed_attendees',
      title: 'Get unconfirmed attendees',
      description: 'Read attendees still unconfirmed in the active accountability session, with reconciled totals and a snapshot time.',
      inputSchema: eventInputSchema,
      annotations: readOnlyAnnotations,
      execute: (input) => handlers.getUnconfirmedAttendees(stringInput(input, 'eventId')),
    },
    {
      name: 'record_accountability_status',
      title: 'Record accountability status',
      description: 'Record one identified unconfirmed attendee as accounted for in the active accountability session. The change is audited and visible on the page.',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: eventIdSchema(activeEventId),
          attendeeId: {
            type: 'string',
            minLength: 1,
            description: 'The stable attendee identifier returned by get_unconfirmed_attendees.',
          },
          status: {
            type: 'string',
            const: 'accounted_for',
            description: 'The only status this tool can record.',
          },
          note: {
            type: 'string',
            description: 'An optional factual note about the accountability update.',
          },
        },
        required: ['eventId', 'attendeeId', 'status'],
        additionalProperties: false,
      },
      annotations: writeAnnotations,
      execute: (input) => handlers.recordAccountabilityStatus({
        eventId: stringInput(input, 'eventId'),
        attendeeId: stringInput(input, 'attendeeId'),
        status: stringInput(input, 'status'),
        note: stringInput(input, 'note'),
      }),
    },
    {
      name: 'generate_incident_summary',
      title: 'Generate incident summary',
      description: 'Read a factual structured summary of the accountability session, including recorded times, totals and missing information.',
      inputSchema: eventInputSchema,
      annotations: readOnlyAnnotations,
      execute: (input) => handlers.generateIncidentSummary(stringInput(input, 'eventId')),
    },
    {
      name: 'close_evacuation_accountability',
      title: 'Close evacuation accountability',
      description: 'Close the active accountability session and audit the closure, reporting how many attendees remain unconfirmed.',
      inputSchema: eventInputSchema,
      annotations: writeAnnotations,
      execute: (input) => handlers.closeAccountability(stringInput(input, 'eventId')),
    },
  ]
}
