import { describe, expect, it, vi } from 'vitest'
import { createAccountabilityTools, type AccountabilityToolHandlers } from './accountabilityTools'

describe('evacuation accountability WebMCP tools', () => {
  it('defines five narrow contracts bound to the active event', async () => {
    const handlers: AccountabilityToolHandlers = {
      startAccountability: vi.fn((eventId) => ({ eventId })),
      getUnconfirmedAttendees: vi.fn((eventId) => ({ eventId })),
      recordAccountabilityStatus: vi.fn((input) => input),
      generateIncidentSummary: vi.fn((eventId) => ({ eventId })),
      closeAccountability: vi.fn((eventId) => ({ eventId })),
    }
    const tools = createAccountabilityTools('event_1', handlers)

    expect(tools.map((tool) => tool.name)).toEqual([
      'start_evacuation_accountability',
      'get_unconfirmed_attendees',
      'record_accountability_status',
      'generate_incident_summary',
      'close_evacuation_accountability',
    ])
    expect(tools.map((tool) => tool.annotations?.readOnlyHint)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ])
    expect(tools.every((tool) => (
      (tool.inputSchema.properties as Record<string, Record<string, unknown>>).eventId.const === 'event_1'
    ))).toBe(true)
    expect(tools[2].inputSchema).toMatchObject({
      required: ['eventId', 'attendeeId', 'status'],
      additionalProperties: false,
      properties: {
        attendeeId: { type: 'string', minLength: 1 },
        status: { const: 'accounted_for' },
        note: { type: 'string' },
      },
    })

    await tools[0].execute({ eventId: 'event_1' })
    await tools[1].execute({ eventId: 'event_1' })
    await tools[2].execute({
      eventId: 'event_1',
      attendeeId: 'attendee_1',
      status: 'accounted_for',
      note: 'At the east assembly point.',
    })
    await tools[3].execute({ eventId: 'event_1' })
    await tools[4].execute({ eventId: 'event_1' })

    expect(handlers.startAccountability).toHaveBeenCalledWith('event_1')
    expect(handlers.getUnconfirmedAttendees).toHaveBeenCalledWith('event_1')
    expect(handlers.recordAccountabilityStatus).toHaveBeenCalledWith({
      eventId: 'event_1',
      attendeeId: 'attendee_1',
      status: 'accounted_for',
      note: 'At the east assembly point.',
    })
    expect(handlers.generateIncidentSummary).toHaveBeenCalledWith('event_1')
    expect(handlers.closeAccountability).toHaveBeenCalledWith('event_1')
  })
})
