import { describe, expect, it, vi } from 'vitest'
import { createPublicBookingTools, type PublicBookingToolHandlers } from './publicBookingTools'

describe('public booking WebMCP tools', () => {
  it('defines narrow review and confirmation contracts without child identity fields', async () => {
    const handlers: PublicBookingToolHandlers = {
      createFreeBookingDraft: vi.fn((input) => input),
      confirmFreeBooking: vi.fn((input) => input),
    }
    const tools = createPublicBookingTools(['event_1'], handlers)

    expect(tools.map((tool) => tool.name)).toEqual([
      'create_free_booking_draft',
      'confirm_free_booking',
    ])
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === false)).toBe(true)
    expect(tools[0].inputSchema).toMatchObject({
      required: ['eventId', 'adultTickets', 'childTickets', 'guardianName', 'guardianEmail'],
      additionalProperties: false,
      properties: {
        eventId: { enum: ['event_1'] },
        adultTickets: { type: 'integer', minimum: 0, maximum: 6 },
        childTickets: { type: 'integer', minimum: 0, maximum: 5 },
      },
    })
    const draftProperties = Object.keys(tools[0].inputSchema.properties as Record<string, unknown>)
    expect(draftProperties).not.toEqual(expect.arrayContaining([
      'childName',
      'childDateOfBirth',
      'schoolRecord',
      'healthInformation',
    ]))
    expect(tools[1].inputSchema).toMatchObject({
      required: ['draftId', 'idempotencyKey'],
      additionalProperties: false,
    })

    await tools[0].execute({
      eventId: 'event_1',
      adultTickets: 1,
      childTickets: 2,
      guardianName: 'Alex Morgan',
      guardianEmail: 'alex@example.test',
    })
    await tools[1].execute({ draftId: 'draft_1', idempotencyKey: 'attempt_1' })

    expect(handlers.createFreeBookingDraft).toHaveBeenCalledWith({
      eventId: 'event_1',
      adultTickets: 1,
      childTickets: 2,
      guardianName: 'Alex Morgan',
      guardianEmail: 'alex@example.test',
    })
    expect(handlers.confirmFreeBooking).toHaveBeenCalledWith({
      draftId: 'draft_1',
      idempotencyKey: 'attempt_1',
    })
  })
})
