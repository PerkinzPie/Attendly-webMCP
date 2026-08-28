import { describe, expect, it, vi } from 'vitest'
import { createEventContextTools } from './eventContextTools'

describe('active event context WebMCP tool', () => {
  it('is read-only and delegates the active context to its application handler', async () => {
    const getActiveEventContext = vi.fn(() => ({ ok: true, eventId: 'event_1' }))
    const [tool] = createEventContextTools(getActiveEventContext)

    expect(tool.name).toBe('get_active_event_context')
    expect(tool.annotations).toMatchObject({ readOnlyHint: true })
    expect(await tool.execute({})).toEqual({ ok: true, eventId: 'event_1' })
    expect(getActiveEventContext).toHaveBeenCalledOnce()
  })
})
