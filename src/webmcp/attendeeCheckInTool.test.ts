import { describe, expect, it, vi } from 'vitest'
import { createAttendeeCheckInTool } from './attendeeCheckInTool'

describe('attendee check-in WebMCP tool', () => {
  it('defines one state-changing tool bound to the active event and stable attendee IDs', async () => {
    const checkInAttendee = vi.fn((input) => input)
    const tool = createAttendeeCheckInTool('event_1', checkInAttendee)

    expect(tool.name).toBe('check_in_attendee')
    expect(tool.annotations).toMatchObject({ readOnlyHint: false })
    expect(tool.inputSchema).toMatchObject({
      required: ['eventId', 'reason'],
      additionalProperties: false,
      properties: {
        eventId: { const: 'event_1' },
        attendeeId: { type: 'string', minLength: 1 },
        query: { type: 'string', minLength: 1 },
        reason: { type: 'string', minLength: 1 },
      },
    })

    await tool.execute({
      eventId: 'event_1',
      attendeeId: 'attendee_1',
      reason: 'Unrecognised ticket code',
    })

    expect(checkInAttendee).toHaveBeenCalledWith({
      eventId: 'event_1',
      attendeeId: 'attendee_1',
      query: '',
      reason: 'Unrecognised ticket code',
    })
  })
})
