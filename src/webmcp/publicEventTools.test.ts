import { describe, expect, it, vi } from 'vitest'
import { createPublicEventTools, type PublicEventToolHandlers } from './publicEventTools'

describe('public event WebMCP tools', () => {
  it('defines two narrow read-only contracts scoped to published events', async () => {
    const handlers: PublicEventToolHandlers = {
      searchPublicEvents: vi.fn((input) => input),
      getPublicEventDetails: vi.fn((eventId) => ({ eventId })),
    }
    const tools = createPublicEventTools(['event_1', 'event_2'], handlers)

    expect(tools.map((tool) => tool.name)).toEqual([
      'search_public_events',
      'get_public_event_details',
    ])
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true)
    expect(tools[0].inputSchema).toMatchObject({
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        fromDate: { type: 'string', format: 'date' },
        toDate: { type: 'string', format: 'date' },
        audience: { enum: ['adults', 'all-ages', 'children', 'families'] },
        age: { type: 'integer', minimum: 0, maximum: 17 },
      },
    })
    expect(tools[0].inputSchema).not.toHaveProperty('required')
    expect(tools[1].inputSchema).toMatchObject({
      required: ['eventId'],
      additionalProperties: false,
      properties: { eventId: { enum: ['event_1', 'event_2'] } },
    })

    await tools[0].execute({
      fromDate: '2026-09-02',
      toDate: '2027-03-02',
      audience: 'children',
      age: 8,
    })
    await tools[1].execute({ eventId: 'event_1' })

    expect(handlers.searchPublicEvents).toHaveBeenCalledWith({
      fromDate: '2026-09-02',
      toDate: '2027-03-02',
      audience: 'children',
      age: 8,
    })
    expect(handlers.getPublicEventDetails).toHaveBeenCalledWith('event_1')
  })

  it('passes a free-text query without dates so the catalogue applies its default range', async () => {
    const handlers: PublicEventToolHandlers = {
      searchPublicEvents: vi.fn((input) => input),
      getPublicEventDetails: vi.fn(),
    }
    const [search] = createPublicEventTools(['event_1'], handlers)

    await search.execute({ query: 'Willowbrook' })

    expect(handlers.searchPublicEvents).toHaveBeenCalledWith({ query: 'Willowbrook' })
  })
})
