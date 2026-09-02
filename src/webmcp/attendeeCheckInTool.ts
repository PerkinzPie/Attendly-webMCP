import type { WebMcpTool } from './browserAdapter'

export type AttendeeCheckInToolInput = {
  readonly eventId: string
  readonly attendeeId: string
  readonly query: string
  readonly reason: string
}

function stringInput(input: Record<string, unknown>, key: string) {
  return typeof input[key] === 'string' ? input[key] : ''
}

export function createAttendeeCheckInTool(
  activeEventId: string,
  checkInAttendee: (input: AttendeeCheckInToolInput) => unknown | Promise<unknown>,
): WebMcpTool {
  return {
    name: 'check_in_attendee',
    title: 'Check in attendee',
    description: 'Check one attendee identified by a stable ID into the active event exactly once, recording the given reason in the activity timeline.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          const: activeEventId,
          description: 'The event currently open in event management.',
        },
        attendeeId: {
          type: 'string',
          minLength: 1,
          description: 'The stable attendee identifier returned by find_attendee.',
        },
        query: {
          type: 'string',
          minLength: 1,
          description: 'Search text supplied instead of an attendee identifier. This cannot identify the check-in target.',
        },
        reason: {
          type: 'string',
          minLength: 1,
          description: 'Why a manual check-in is required.',
        },
      },
      required: ['eventId', 'reason'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: false,
    },
    execute: (input) => checkInAttendee({
      eventId: stringInput(input, 'eventId'),
      attendeeId: stringInput(input, 'attendeeId'),
      query: stringInput(input, 'query'),
      reason: stringInput(input, 'reason'),
    }),
  }
}
