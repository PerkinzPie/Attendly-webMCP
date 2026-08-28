import { describe, expect, it, vi } from 'vitest'
import {
  createEventPreparationTools,
  type EventPreparationToolHandlers,
} from './eventPreparationTools'

describe('event preparation WebMCP tools', () => {
  it('defines narrow event-list, draft and confirmation contracts', async () => {
    const handlers: EventPreparationToolHandlers = {
      listEvents: vi.fn(() => ({ events: [] })),
      createEventDraft: vi.fn((input) => ({ draft: input })),
      confirmEventCreation: vi.fn((draftId) => ({ draftId })),
    }
    const tools = createEventPreparationTools(handlers, ['org_lantern_rooms'])

    expect(tools.map((tool) => tool.name)).toEqual([
      'list_events',
      'create_event_draft',
      'confirm_event_creation',
    ])
    expect(tools[0].annotations).toMatchObject({ readOnlyHint: true })
    expect(tools[0].inputSchema).toMatchObject({
      type: 'object',
      properties: {},
      additionalProperties: false,
    })
    expect(tools[1].inputSchema).toMatchObject({
      required: ['organisationId', 'name', 'startsAt', 'venue', 'capacity'],
      additionalProperties: false,
      properties: {
        organisationId: { enum: ['org_lantern_rooms'] },
        capacity: { type: 'integer', minimum: 1 },
      },
    })
    expect(tools[2].inputSchema).toMatchObject({
      required: ['draftId'],
      additionalProperties: false,
    })

    await tools[0].execute({})
    await tools[1].execute({
      organisationId: 'org_lantern_rooms',
      name: 'Family Games Night',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Main Hall',
      capacity: 8,
    })
    await tools[2].execute({ draftId: 'draft_1' })

    expect(handlers.listEvents).toHaveBeenCalledOnce()
    expect(handlers.createEventDraft).toHaveBeenCalledWith({
      organisationId: 'org_lantern_rooms',
      name: 'Family Games Night',
      startsAt: '2026-10-10T18:30:00.000Z',
      venue: 'Main Hall',
      capacity: 8,
    })
    expect(handlers.confirmEventCreation).toHaveBeenCalledWith('draft_1')
  })
})
