import type { WebMcpTool } from './browserAdapter'

export type EventReadToolHandlers = {
  getEventSnapshot(eventId: string): unknown
  findAttendee(eventId: string, query: string): unknown
  getAttendanceAnomalies(eventId: string): unknown
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

export function createEventReadTools(
  activeEventId: string,
  handlers: EventReadToolHandlers,
): readonly WebMcpTool[] {
  const readOnlyAnnotations = {
    readOnlyHint: true,
    untrustedContentHint: false,
  } as const

  return [
    {
      name: 'get_event_snapshot',
      title: 'Get event snapshot',
      description: 'Read reconciled registration, attendance, capacity and accountability totals for the active event.',
      inputSchema: {
        type: 'object',
        properties: { eventId: eventIdSchema(activeEventId) },
        required: ['eventId'],
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations,
      execute: (input) => handlers.getEventSnapshot(stringInput(input, 'eventId')),
    },
    {
      name: 'find_attendee',
      title: 'Find attendee',
      description: 'Find ranked attendee matches in the active event by partial name or registration details. This does not change attendance.',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: eventIdSchema(activeEventId),
          query: {
            type: 'string',
            minLength: 1,
            description: 'A partial attendee name, email address or registration reference.',
          },
        },
        required: ['eventId', 'query'],
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations,
      execute: (input) => handlers.findAttendee(
        stringInput(input, 'eventId'),
        stringInput(input, 'query'),
      ),
    },
    {
      name: 'get_attendance_anomalies',
      title: 'Get attendance anomalies',
      description: 'Read detected attendance and capacity anomalies for the active event, including their evidence and related record identifiers.',
      inputSchema: {
        type: 'object',
        properties: { eventId: eventIdSchema(activeEventId) },
        required: ['eventId'],
        additionalProperties: false,
      },
      annotations: readOnlyAnnotations,
      execute: (input) => handlers.getAttendanceAnomalies(stringInput(input, 'eventId')),
    },
  ]
}
