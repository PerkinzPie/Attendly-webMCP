import { describe, expect, it, vi } from 'vitest'
import { createEventReadTools, type EventReadToolHandlers } from './eventReadTools'

describe('event read WebMCP tools', () => {
  it('defines narrow read-only contracts bound to one active event', async () => {
    const handlers: EventReadToolHandlers = {
      getEventSnapshot: vi.fn((eventId) => ({ eventId })),
      findAttendee: vi.fn((eventId, query) => ({ eventId, query })),
      getAttendanceAnomalies: vi.fn((eventId) => ({ eventId })),
    }
    const tools = createEventReadTools('event_1', handlers)

    expect(tools.map((tool) => tool.name)).toEqual([
      'get_event_snapshot',
      'find_attendee',
      'get_attendance_anomalies',
    ])
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true)
    expect(tools.every((tool) => (
      (tool.inputSchema.properties as Record<string, Record<string, unknown>>).eventId.const === 'event_1'
    ))).toBe(true)

    await tools[0].execute({ eventId: 'event_1' })
    await tools[1].execute({ eventId: 'event_1', query: 'jenk' })
    await tools[2].execute({ eventId: 'event_1' })

    expect(handlers.getEventSnapshot).toHaveBeenCalledWith('event_1')
    expect(handlers.findAttendee).toHaveBeenCalledWith('event_1', 'jenk')
    expect(handlers.getAttendanceAnomalies).toHaveBeenCalledWith('event_1')
  })
})
