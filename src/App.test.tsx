import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createEventOperationsService, type EventOperationsService } from './application/eventOperationsService'
import { createPersistentEventOperationsStore } from './application/eventOperationsStore'
import { createDemoEventOperationsState, demoOrganisations } from './demo/seed'
import type { OperationsActor } from './domain/eventOperations'
import type { WebMcpTool } from './webmcp/browserAdapter'

const activeEventToolNames = [
  'get_event_snapshot',
  'find_attendee',
  'get_attendance_anomalies',
  'check_in_attendee',
  'start_evacuation_accountability',
  'get_unconfirmed_attendees',
  'record_accountability_status',
  'generate_incident_summary',
  'close_evacuation_accountability',
]

const organiser: OperationsActor = {
  id: 'actor_shell_test',
  displayName: 'Synthetic shell tester',
  channel: 'human-ui',
  isSynthetic: true,
}

function createTestOperationsHarness() {
  const values = new Map<string, string>()
  let sequence = 0
  let failNextWrite = false
  const store = createPersistentEventOperationsStore({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (failNextWrite) {
          failNextWrite = false
          throw new Error('Synthetic storage failure')
        }
        values.set(key, value)
      },
    },
    initialState: createDemoEventOperationsState(),
  })

  const service = createEventOperationsService({
    store,
    authorise: () => true,
    now: () => '2026-09-05T18:30:00+01:00',
    createId: (kind) => `${kind}_${++sequence}`,
    resetState: createDemoEventOperationsState,
    authorisedOrganisationIds: demoOrganisations.map((organisation) => organisation.id),
  })

  return {
    service,
    failNextWrite() {
      failNextWrite = true
    },
  }
}

function createTestOperationsService(): EventOperationsService {
  return createTestOperationsHarness().service
}

function installModelContext() {
  const tools = new Map<string, WebMcpTool>()
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: {
      async registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }) {
        tools.set(tool.name, tool)
        options?.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true })
      },
    },
  })
  return tools
}

function openOrganisation(name: string) {
  const heading = screen.getByRole('heading', { name })
  const row = heading.closest('article')
  expect(row).not.toBeNull()
  fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'View events' }))
}

function openManagedEvent(name = 'Riverside Community Workshop') {
  fireEvent.click(screen.getByRole('button', { name: 'Events' }))
  const heading = screen.getByRole('heading', { level: 2, name })
  const row = heading.closest('article')
  expect(row).not.toBeNull()
  fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Open' }))
}

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined })
})

describe('Attendly organisation directory', () => {
  it('presents organisations as the top-level entities', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Find events in your community' })).toBeInTheDocument()
    expect(screen.getByText('6 organisations · 18 events')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Willowbrook Primary School' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'St Cuthbert’s Parish Church' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Willowbrook Autumn Fair' })).not.toBeInTheDocument()
    expect(screen.queryByText(/synthetic demo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fictional and use synthetic data/i)).not.toBeInTheDocument()
    expect(screen.getByText('Site tools require a WebMCP-enabled browser.')).toBeInTheDocument()
  })

  it('exposes scoped public event search and detail tools', async () => {
    const tools = installModelContext()
    render(<App operationsService={createTestOperationsService()} />)

    await waitFor(() => expect([...tools.keys()]).toEqual([
      'search_public_events',
      'get_public_event_details',
      'create_free_booking_draft',
      'confirm_free_booking',
    ]))
    expect(tools.get('search_public_events')?.annotations?.readOnlyHint).toBe(true)
    expect(tools.get('get_public_event_details')?.annotations?.readOnlyHint).toBe(true)

    const search = await tools.get('search_public_events')?.execute({
      fromDate: '2026-09-02',
      toDate: '2027-03-02',
      audience: 'children',
      age: 4,
    }) as {
      structuredContent: {
        ok: boolean
        scope: { organisationId: string | null }
        events: Array<{
          eventId: string
          suitability: { evidence: string }
          availability: { remaining: number }
        }>
      }
    }
    expect(search.structuredContent.scope).toEqual({ organisationId: null })
    expect(search.structuredContent.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventId: 'evt_autumn_fair',
        suitability: expect.objectContaining({ evidence: 'organiser-authored event metadata' }),
        availability: expect.objectContaining({ remaining: 44 }),
      }),
    ]))

    const excessiveRange = await tools.get('search_public_events')?.execute({
      fromDate: '2026-09-02',
      toDate: '2027-03-03',
    }) as { structuredContent: { error: { code: string } } }
    expect(excessiveRange.structuredContent.error.code).toBe('date_range_too_large')

    const details = await tools.get('get_public_event_details')?.execute({
      eventId: 'evt_autumn_fair',
    }) as {
      structuredContent: {
        event: {
          eventId: string
          publicationStatus: string
          bookingRules: { maximumTicketsPerBooking: number }
        }
      }
    }
    expect(details.structuredContent.event).toMatchObject({
      eventId: 'evt_autumn_fair',
      publicationStatus: 'published',
      bookingRules: { maximumTicketsPerBooking: 6 },
    })
    expect(JSON.stringify(details.structuredContent)).not.toMatch(/attendee|email|check-in/i)

    openOrganisation('Willowbrook Primary School')
    await waitFor(() => {
      const eventSchema = tools.get('get_public_event_details')?.inputSchema.properties as Record<string, { enum: string[] }>
      expect(eventSchema.eventId.enum).toEqual([
        'evt_autumn_fair',
        'evt_online_safety',
        'evt_reception_welcome',
      ])
    })
    const scopedSearch = await tools.get('search_public_events')?.execute({
      fromDate: '2026-09-02',
      toDate: '2027-03-02',
    }) as { structuredContent: { scope: { organisationId: string }, events: Array<{ organisation: { id: string } }> } }
    expect(scopedSearch.structuredContent.scope).toEqual({ organisationId: 'org_westbrook_school' })
    expect(scopedSearch.structuredContent.events.every((event) => (
      event.organisation.id === 'org_westbrook_school'
    ))).toBe(true)
  })

  it('renders, confirms and reconciles a free booking prepared through WebMCP', async () => {
    const tools = installModelContext()
    render(<App operationsService={createTestOperationsService()} />)

    await waitFor(() => expect(tools.has('create_free_booking_draft')).toBe(true))
    let draftResult: {
      structuredContent: {
        draft: {
          draftId: string
          quantities: { adultTickets: number, childTickets: number, total: number }
          price: { display: string }
          availability: { remaining: number }
          persisted: boolean
          expiresAt: string
        }
      }
    } | undefined
    await act(async () => {
      draftResult = await tools.get('create_free_booking_draft')?.execute({
        eventId: 'evt_autumn_fair',
        adultTickets: 1,
        childTickets: 2,
        guardianName: 'Alex Morgan',
        guardianEmail: 'alex@example.test',
      }) as typeof draftResult
    })

    expect(draftResult?.structuredContent.draft).toMatchObject({
      draftId: expect.any(String),
      quantities: { adultTickets: 1, childTickets: 2, total: 3 },
      price: { display: '£0.00' },
      availability: { remaining: 44 },
      persisted: false,
      expiresAt: expect.any(String),
    })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Check your booking' })).toBeInTheDocument()
    expect(within(dialog).getByText('Adult tickets').parentElement).toHaveTextContent('1')
    expect(within(dialog).getByText('Child tickets').parentElement).toHaveTextContent('2')
    expect(within(dialog).getByText('Booked by').parentElement).toHaveTextContent('Alex Morgan')
    expect(within(dialog).getByText('Nothing is booked until you confirm below.')).toBeInTheDocument()

    const draftId = draftResult?.structuredContent.draft.draftId ?? ''
    expect(within(dialog).queryByText('Booking reference')).not.toBeInTheDocument()

    let confirmed: {
      structuredContent: {
        idempotent: boolean
        booking: { bookingReference: string, availability: { remaining: number } }
      }
    } | undefined
    await act(async () => {
      confirmed = await tools.get('confirm_free_booking')?.execute({
        draftId,
        idempotencyKey: 'booking-attempt-1',
      }) as typeof confirmed
    })
    expect(confirmed?.structuredContent).toMatchObject({
      idempotent: false,
      booking: {
        bookingReference: expect.stringMatching(/^ATT-/),
        availability: { remaining: 41 },
      },
    })
    const bookingReference = confirmed?.structuredContent.booking.bookingReference ?? ''
    expect(within(dialog).getByText('Booking reference').parentElement).toHaveTextContent(bookingReference)

    const details = await tools.get('get_public_event_details')?.execute({
      eventId: 'evt_autumn_fair',
    }) as { structuredContent: { event: { availability: { remaining: number } } } }
    expect(details.structuredContent.event.availability.remaining).toBe(41)

    const repeated = await tools.get('confirm_free_booking')?.execute({
      draftId,
      idempotencyKey: 'booking-attempt-1',
    }) as typeof confirmed
    expect(repeated?.structuredContent).toMatchObject({
      idempotent: true,
      booking: { bookingReference, availability: { remaining: 41 } },
    })
  })

  it('lists events and opens a stable event management context', () => {
    render(<App />)

    expect(screen.getByText('Attendly-webMCP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attendly-webMCP home' })).toBeInTheDocument()

    const publicEvents = screen.getByRole('button', { name: 'Public events' })
    const events = screen.getByRole('button', { name: 'Events' })
    expect(publicEvents).toHaveAttribute('aria-current', 'page')
    events.focus()
    expect(events).toHaveFocus()
    fireEvent.click(events)

    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toHaveFocus()
    expect(window.location.pathname).toBe('/events')
    const eventRow = screen.getByRole('heading', { level: 2, name: 'Riverside Community Workshop' }).closest('article')
    expect(eventRow).not.toBeNull()
    expect(within(eventRow as HTMLElement).getByText('5 Sept 2026, 18:30')).toBeInTheDocument()
    expect(within(eventRow as HTMLElement).getByText('Capacity').parentElement).toHaveTextContent('20')
    expect(within(eventRow as HTMLElement).getByText('Status').parentElement).toHaveTextContent('Check-in open')

    fireEvent.click(within(eventRow as HTMLElement).getByRole('button', { name: 'Open' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Riverside Community Workshop' })).toHaveFocus()
    expect(screen.getByText('The Old Market Rooms · Frome, Somerset')).toBeInTheDocument()
    expect(screen.queryByText('Event ID')).not.toBeInTheDocument()
    expect(screen.queryByText('evt_riverside_community_workshop')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Activity' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/organisations/org_lantern_rooms/events/evt_riverside_community_workshop')
    expect(events).toHaveAttribute('aria-current', 'page')
    const totals = screen.getByLabelText('Current event totals')
    expect(within(totals).getByText('Registered').nextElementSibling).toHaveTextContent('16')
    expect(within(totals).getByText('Checked in').nextElementSibling).toHaveTextContent('13')
    expect(within(totals).getByText('Not arrived').nextElementSibling).toHaveTextContent('3')
    expect(within(totals).getByText('Capacity remaining').nextElementSibling).toHaveTextContent('7')
    const attendees = screen.getByRole('region', { name: 'Attendees' })
    expect(within(attendees).getByText('16 attendees')).toBeInTheDocument()
    expect(within(attendees).getAllByRole('heading', { level: 3 })).toHaveLength(16)
    expect(within(attendees).getAllByText('Checked in')).toHaveLength(13)
    expect(within(attendees).getAllByText('Not arrived')).toHaveLength(3)
    expect(screen.getByText('Current').parentElement).toHaveTextContent('Updated 18:14')
    const refresh = screen.getByRole('button', { name: 'Refresh live data' })
    expect(refresh).toHaveTextContent('')
    expect(refresh.querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Browse public events' })).not.toBeInTheDocument()
  })

  it('exposes reviewable event preparation tools on the events page', async () => {
    const service = createTestOperationsService()
    const tools = installModelContext()
    render(<App operationsService={service} />)
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))

    await waitFor(() => expect([...tools.keys()]).toEqual([
      'list_events',
      'create_event_draft',
      'confirm_event_creation',
    ]))
    expect(screen.queryByText('Site tools require a WebMCP-enabled browser.')).not.toBeInTheDocument()

    const listResult = await tools.get('list_events')?.execute({}) as {
      structuredContent: { ok: boolean, events: Array<Record<string, unknown>> }
    }
    expect(tools.get('list_events')?.annotations).toMatchObject({ readOnlyHint: true })
    expect(listResult.structuredContent.ok).toBe(true)
    expect(listResult.structuredContent.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'evt_riverside_community_workshop',
        organisationName: 'The Old Market Rooms',
        organisationLocation: 'Frome, Somerset',
        name: 'Riverside Community Workshop',
        venue: 'Riverside Community Hall',
        capacity: 20,
        state: 'Check-in open',
      }),
    ]))

    let draftResult: {
      structuredContent: {
        ok: boolean
        draft: { id: string }
        warnings: Array<{ field: string, message: string }>
        persisted: boolean
      }
    } | undefined
    await act(async () => {
      draftResult = await tools.get('create_event_draft')?.execute({
        organisationId: 'org_lantern_rooms',
        name: 'Family Games Night',
        startsAt: '2026-10-10T18:30:00.000Z',
        venue: 'Main Hall',
        capacity: 8,
      }) as typeof draftResult
    })

    expect(draftResult?.structuredContent).toMatchObject({
      ok: true,
      warnings: [{ field: 'capacity' }],
      persisted: false,
    })
    expect(screen.getByRole('heading', { name: 'Review event' })).toBeInTheDocument()
    expect(screen.getByText('Capacity is low; check it before creating the event.')).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { createdEvents: [] } })

    const confirmTool = tools.get('confirm_event_creation')
    const staleResult = await confirmTool?.execute({ draftId: 'draft_stale' }) as {
      structuredContent: { error: { code: string } }
    }
    expect(staleResult.structuredContent.error.code).toBe('stale_event_draft')
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { createdEvents: [] } })

    const draftId = draftResult?.structuredContent.draft.id ?? ''
    await act(async () => {
      await confirmTool?.execute({ draftId })
    })

    expect(screen.getByRole('heading', { level: 2, name: 'Family Games Night' })).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({
      ok: true,
      data: { createdEvents: [{ name: 'Family Games Night', capacity: 8 }] },
    })
    const updatedListResult = await tools.get('list_events')?.execute({}) as {
      structuredContent: { events: Array<{ name: string }> }
    }
    expect(updatedListResult.structuredContent.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Family Games Night' }),
    ]))

    const repeatedResult = await confirmTool?.execute({ draftId }) as {
      structuredContent: { error: { code: string } }
    }
    expect(repeatedResult.structuredContent.error.code).toBe('stale_event_draft')
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { createdEvents: [{ name: 'Family Games Night' }] } })
  })

  it('replaces event-list tools with active event tools and rejects stale execution', async () => {
    const tools = installModelContext()
    render(<App operationsService={createTestOperationsService()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))

    await waitFor(() => expect([...tools.keys()]).toEqual([
      'list_events',
      'create_event_draft',
      'confirm_event_creation',
    ]))
    const staleListTool = tools.get('list_events')

    const eventRow = screen.getByRole('heading', { level: 2, name: 'Riverside Community Workshop' }).closest('article')
    expect(eventRow).not.toBeNull()
    fireEvent.click(within(eventRow as HTMLElement).getByRole('button', { name: 'Open' }))

    await waitFor(() => expect([...tools.keys()]).toEqual(activeEventToolNames))
    await expect(staleListTool?.execute({})).rejects.toMatchObject({ name: 'AbortError' })
    const result = await tools.get('get_event_snapshot')?.execute({ eventId: 'evt_riverside_community_workshop' }) as {
      structuredContent: { event: { eventId: string, organisationId: string, organisationName: string, organisationLocation: string, venue: string } }
    }
    expect(result.structuredContent.event).toMatchObject({
      eventId: 'evt_riverside_community_workshop',
      organisationId: 'org_lantern_rooms',
      organisationName: 'The Old Market Rooms',
      organisationLocation: 'Frome, Somerset',
      name: 'Riverside Community Workshop',
      venue: 'Riverside Community Hall',
    })
    const staleEventSnapshotTool = tools.get('get_event_snapshot')

    fireEvent.click(screen.getByRole('button', { name: '← Events' }))
    await waitFor(() => expect([...tools.keys()]).toEqual([
      'list_events',
      'create_event_draft',
      'confirm_event_creation',
    ]))

    const nextEventRow = screen.getByRole('heading', { level: 2, name: 'Family Sports Taster Day' }).closest('article')
    expect(nextEventRow).not.toBeNull()
    fireEvent.click(within(nextEventRow as HTMLElement).getByRole('button', { name: 'Open' }))

    await waitFor(() => expect([...tools.keys()]).toEqual(['get_active_event_context']))
    await expect(staleEventSnapshotTool?.execute({ eventId: 'evt_riverside_community_workshop' }))
      .rejects.toMatchObject({ name: 'AbortError' })
    const nextResult = await tools.get('get_active_event_context')?.execute({}) as {
      structuredContent: { event: { eventId: string, organisationId: string, organisationName: string, organisationLocation: string, name: string, venue: string } }
    }
    expect(nextResult.structuredContent.event).toEqual({
      eventId: 'evt_family_sports',
      organisationId: 'org_redland_sports',
      organisationName: 'Kingsmead Community Sports Club',
      organisationLocation: 'Bath, Somerset',
      name: 'Family Sports Taster Day',
      venue: 'Kingsmead Sports Ground',
    })
  })

  it('exposes grounded read-only snapshot, attendee and anomaly tools for the active control room', async () => {
    const service = createTestOperationsService()
    const tools = installModelContext()
    render(<App operationsService={service} />)
    openManagedEvent()

    await waitFor(() => expect([...tools.keys()]).toEqual(activeEventToolNames))
    expect(['get_event_snapshot', 'find_attendee', 'get_attendance_anomalies']
      .every((name) => tools.get(name)?.annotations?.readOnlyHint)).toBe(true)
    expect(tools.get('check_in_attendee')?.annotations?.readOnlyHint).toBe(false)
    const before = service.getSnapshot()

    const snapshotResult = await tools.get('get_event_snapshot')?.execute({
      eventId: 'evt_riverside_community_workshop',
    }) as {
      structuredContent: {
        event: { eventId: string, organisationLocation: string, venue: string }
        snapshotAt: string
        totals: Record<string, number>
        accountability: { status: string, total: number, accountedFor: number, unconfirmed: number }
      }
    }
    expect(snapshotResult.structuredContent).toMatchObject({
      event: {
        eventId: 'evt_riverside_community_workshop',
        organisationLocation: 'Frome, Somerset',
        venue: 'Riverside Community Hall',
      },
      snapshotAt: '2026-09-05T18:14:00+01:00',
      totals: {
        registered: 16,
        checkedIn: 13,
        notArrived: 3,
        capacity: 20,
        capacityRemaining: 7,
        overCapacityBy: 0,
      },
      accountability: {
        status: 'not-active',
        total: 0,
        accountedFor: 0,
        unconfirmed: 0,
      },
    })

    const attendeeResult = await tools.get('find_attendee')?.execute({
      eventId: 'evt_riverside_community_workshop',
      query: 'jenk',
    }) as {
      structuredContent: {
        matches: Array<{ attendeeId: string, name: string, checkIn: { status: string } }>
      }
    }
    expect(attendeeResult.structuredContent.matches).toEqual([
      expect.objectContaining({
        attendeeId: 'att_sarah_jenkins',
        name: 'Sarah Jenkins',
        checkIn: expect.objectContaining({ status: 'not-arrived' }),
      }),
      expect.objectContaining({
        attendeeId: 'att_leo_jenkins',
        name: 'Leo Jenkins',
        checkIn: expect.objectContaining({ status: 'not-arrived' }),
      }),
    ])

    const anomalyResult = await tools.get('get_attendance_anomalies')?.execute({
      eventId: 'evt_riverside_community_workshop',
    }) as {
      structuredContent: {
        anomalies: Array<{ type: string, severity: string, evidence: Record<string, unknown>, recordIds: Record<string, unknown> }>
      }
    }
    expect(anomalyResult.structuredContent.anomalies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'near-capacity',
        severity: 'warning',
        evidence: expect.objectContaining({ registeredAttendees: 16, capacity: 20 }),
        recordIds: { eventId: 'evt_riverside_community_workshop' },
      }),
      expect.objectContaining({
        type: 'duplicate-registration-candidate',
        severity: 'warning',
        evidence: expect.objectContaining({ matchingEmail: 'sarah.jenkins@example.test' }),
        recordIds: expect.objectContaining({
          attendeeIds: ['att_sarah_jenkins', 'att_priya_shah'],
          registrationGroupIds: ['reg_jenkins_family', 'reg_priya_shah'],
        }),
      }),
    ]))

    const wrongEventResult = await tools.get('get_event_snapshot')?.execute({ eventId: 'evt_family_sports' }) as {
      structuredContent: { error: { code: string }, event?: unknown }
    }
    expect(wrongEventResult.structuredContent).toEqual({
      ok: false,
      error: {
        code: 'wrong_event_context',
        message: 'The requested event is not active on this page.',
      },
    })
    expect(wrongEventResult.structuredContent.event).toBeUndefined()
    expect(service.getSnapshot()).toEqual(before)
  })

  it('reviews and confirms a stable attendee check-in exactly once', async () => {
    const service = createTestOperationsService()
    const tools = installModelContext()
    render(<App operationsService={service} />)
    openManagedEvent()

    await waitFor(() => expect(tools.has('check_in_attendee')).toBe(true))
    const tool = tools.get('check_in_attendee')
    const before = service.getSnapshot()
    const ambiguous = await tool?.execute({
      eventId: 'evt_riverside_community_workshop',
      query: 'Sarah Jenkins',
      reason: 'Unrecognised ticket code',
    }) as { structuredContent: { error: { code: string, message: string } } }

    expect(ambiguous.structuredContent.error).toEqual({
      code: 'attendee_id_required',
      message: 'Use the stable attendee identifier returned by find_attendee; a name or search query is not sufficient.',
    })
    const nameAsIdentifier = await tool?.execute({
      eventId: 'evt_riverside_community_workshop',
      attendeeId: 'Sarah Jenkins',
      reason: 'Unrecognised ticket code',
    }) as { structuredContent: { error: { code: string, message: string } } }
    expect(nameAsIdentifier.structuredContent.error).toEqual({
      code: 'attendee_not_found',
      message: 'Use a stable attendee identifier returned by find_attendee for the active event.',
    })
    expect(service.getSnapshot()).toEqual(before)

    let confirmed: {
      structuredContent: {
        idempotent: boolean
        previousState: { status: string, checkedInAt: string | null }
        newState: { status: string, checkedInAt: string | null }
        occupancy: { previous: number, current: number, capacity: number }
        activityId: string | null
        revision: number
      }
    } | undefined

    await act(async () => {
      confirmed = await tool?.execute({
        eventId: 'evt_riverside_community_workshop',
        attendeeId: 'att_sarah_jenkins',
        reason: 'Unrecognised ticket code',
      }) as typeof confirmed
    })

    expect(confirmed?.structuredContent).toMatchObject({
      idempotent: false,
      previousState: { status: 'not-arrived', checkedInAt: null },
      newState: { status: 'checked-in', checkedInAt: '2026-09-05T18:30:00+01:00' },
      occupancy: { previous: 13, current: 14, capacity: 20 },
      activityId: expect.any(String),
      revision: 1,
    })
    const totals = screen.getByLabelText('Current event totals')
    expect(within(totals).getByText('Checked in').parentElement).toHaveTextContent('14')
    expect(within(totals).getByText('Not arrived').parentElement).toHaveTextContent('2')
    const sarahResult = screen.getByRole('heading', { level: 3, name: 'Sarah Jenkins' }).closest('article')
    expect(sarahResult).not.toBeNull()
    expect(within(sarahResult as HTMLElement).getByText('Checked in')).toBeInTheDocument()
    expect(within(sarahResult as HTMLElement).queryByRole('button', { name: 'Check in Sarah Jenkins' })).not.toBeInTheDocument()

    const repeated = await tool?.execute({
      eventId: 'evt_riverside_community_workshop',
      attendeeId: 'att_sarah_jenkins',
      reason: 'Unrecognised ticket code',
    }) as typeof confirmed
    expect(repeated?.structuredContent).toMatchObject({
      idempotent: true,
      previousState: { status: 'checked-in', checkedInAt: '2026-09-05T18:30:00+01:00' },
      newState: { status: 'checked-in', checkedInAt: '2026-09-05T18:30:00+01:00' },
      occupancy: { previous: 14, current: 14, capacity: 20 },
      activityId: confirmed?.structuredContent.activityId,
      revision: 1,
    })

    const snapshot = service.getSnapshot()
    expect(snapshot.ok && snapshot.data.activityTimeline.filter((entry) => (
      entry.action === 'attendee-checked-in' && entry.targetId === 'att_sarah_jenkins'
    ))).toHaveLength(1)
  })

  it('exposes confirmed, audited evacuation accountability tools', async () => {
    const service = createTestOperationsService()
    const tools = installModelContext()
    render(<App operationsService={service} />)
    openManagedEvent()

    await waitFor(() => expect([...tools.keys()]).toEqual(activeEventToolNames))
    const startTool = tools.get('start_evacuation_accountability')
    const unconfirmedTool = tools.get('get_unconfirmed_attendees')
    const recordTool = tools.get('record_accountability_status')
    const summaryTool = tools.get('generate_incident_summary')
    const closeTool = tools.get('close_evacuation_accountability')
    expect(unconfirmedTool?.annotations?.readOnlyHint).toBe(true)
    expect(summaryTool?.annotations?.readOnlyHint).toBe(true)

    let started: {
      structuredContent: {
        sessionId: string
        expectedAttendees: number
        actor: { channel: string }
        activityId: string
        revision: number
      }
    } | undefined
    await act(async () => {
      started = await startTool?.execute({
        eventId: 'evt_riverside_community_workshop',
      }) as typeof started
    })
    expect(started?.structuredContent).toMatchObject({
      sessionId: expect.any(String),
      expectedAttendees: 13,
      actor: { channel: 'webmcp' },
      activityId: expect.any(String),
      revision: 1,
    })

    const afterStart = service.getSnapshot()
    const unconfirmed = await unconfirmedTool?.execute({
      eventId: 'evt_riverside_community_workshop',
    }) as {
      structuredContent: {
        sessionId: string
        snapshotAt: string
        totals: { total: number, accountedFor: number, unconfirmed: number }
        attendees: Array<{ attendeeId: string, name: string, status: string }>
      }
    }
    expect(unconfirmed.structuredContent).toMatchObject({
      sessionId: started?.structuredContent.sessionId,
      snapshotAt: '2026-09-05T18:30:00+01:00',
      totals: { total: 13, accountedFor: 0, unconfirmed: 13 },
    })
    expect(unconfirmed.structuredContent.attendees).toHaveLength(13)
    expect(unconfirmed.structuredContent.attendees).toContainEqual({
      attendeeId: 'att_amina_patel',
      name: 'Amina Patel',
      status: 'unconfirmed',
      note: null,
    })
    expect(service.getSnapshot()).toEqual(afterStart)

    const invalidStatus = await recordTool?.execute({
      eventId: 'evt_riverside_community_workshop',
      attendeeId: 'att_amina_patel',
      status: 'safe',
    }) as { structuredContent: { error: { code: string } } }
    expect(invalidStatus.structuredContent.error.code).toBe('invalid_status')

    let recorded: {
      structuredContent: {
        previousState: { status: string }
        newState: { status: string, note: string | null }
        actor: { channel: string }
        recordedAt: string
        activityId: string
        totals: { accountedFor: number, unconfirmed: number }
      }
    } | undefined
    await act(async () => {
      recorded = await recordTool?.execute({
        eventId: 'evt_riverside_community_workshop',
        attendeeId: 'att_amina_patel',
        status: 'accounted_for',
        note: 'At the east assembly point.',
      }) as typeof recorded
    })
    expect(recorded?.structuredContent).toMatchObject({
      previousState: { status: 'unconfirmed' },
      newState: { status: 'accounted_for', note: 'At the east assembly point.' },
      actor: { channel: 'webmcp' },
      recordedAt: '2026-09-05T18:30:00+01:00',
      activityId: expect.any(String),
      totals: { accountedFor: 1, unconfirmed: 12 },
    })

    const summary = await summaryTool?.execute({
      eventId: 'evt_riverside_community_workshop',
    }) as {
      structuredContent: {
        recordedFacts: {
          session: { status: string, startedAt: string, closedAt: string | null }
          totals: { accountedFor: number, unconfirmed: number }
          attendeeStatuses: Array<{ attendeeId: string, status: string }>
          unresolvedAttendees: Array<{ attendeeId: string }>
        }
        missingInformation: { attendeeStatuses: Array<{ attendeeId: string }> }
        limitations: { physicalSafetyInferred: boolean }
      }
    }
    expect(summary.structuredContent).toMatchObject({
      recordedFacts: {
        session: {
          status: 'active',
          startedAt: '2026-09-05T18:30:00+01:00',
          closedAt: null,
        },
        totals: { accountedFor: 1, unconfirmed: 12 },
        attendeeStatuses: [{ attendeeId: 'att_amina_patel', status: 'accounted_for' }],
      },
      limitations: { physicalSafetyInferred: false },
    })
    expect(summary.structuredContent.recordedFacts.unresolvedAttendees).toHaveLength(12)
    expect(summary.structuredContent.missingInformation.attendeeStatuses).toHaveLength(12)

    let closed: {
      structuredContent: {
        sessionId: string
        unresolvedAttendees: number
        closedAt: string
        actor: { channel: string }
        activityId: string
      }
    } | undefined
    await act(async () => {
      closed = await closeTool?.execute({
        eventId: 'evt_riverside_community_workshop',
      }) as typeof closed
    })
    expect(closed?.structuredContent).toMatchObject({
      sessionId: started?.structuredContent.sessionId,
      unresolvedAttendees: 12,
      closedAt: '2026-09-05T18:30:00+01:00',
      actor: { channel: 'webmcp' },
      activityId: expect.any(String),
    })
    expect(service.getSnapshot()).toMatchObject({
      ok: true,
      data: {
        accountabilitySession: { status: 'closed' },
        activityTimeline: expect.arrayContaining([
          expect.objectContaining({ action: 'accountability-started', toolName: 'start_evacuation_accountability' }),
          expect.objectContaining({ action: 'accountability-status-recorded', toolName: 'record_accountability_status' }),
          expect.objectContaining({ action: 'accountability-closed', toolName: 'close_evacuation_accountability' }),
        ]),
      },
    })
  })

  it('provides a one-click roll check with optional notes and auditable corrections', () => {
    const service = createTestOperationsService()
    render(<App operationsService={service} />)
    openManagedEvent()

    let workspace = screen.getByRole('region', { name: 'Roll call' })
    expect(within(workspace).getByText('0 of 13').parentElement).toHaveTextContent('0 of 13 accounted for')
    expect(within(workspace).getByRole('button', { name: 'Show roll call' })).toHaveAttribute('aria-expanded', 'false')
    expect(within(workspace).queryByRole('checkbox')).not.toBeInTheDocument()

    fireEvent.click(within(workspace).getByRole('button', { name: 'Show roll call' }))

    expect(within(workspace).getByText('Tick each person at the assembly point.')).toBeInTheDocument()
    expect(within(workspace).getAllByRole('checkbox')).toHaveLength(13)
    expect(within(workspace).queryByText('Sarah Jenkins')).not.toBeInTheDocument()

    let aminaRow = within(workspace).getByText('Amina Patel').closest('li')
    expect(aminaRow).not.toBeNull()
    fireEvent.click(within(aminaRow as HTMLElement).getByRole('checkbox', { name: 'Amina Patel' }))

    workspace = screen.getByRole('region', { name: 'Roll call' })
    expect(within(workspace).getByText('1 of 13').parentElement).toHaveTextContent('1 of 13 accounted for')
    aminaRow = within(workspace).getByText('Amina Patel').closest('li')
    expect(within(aminaRow as HTMLElement).getByRole('checkbox', { name: 'Amina Patel' })).toBeChecked()

    expect(within(aminaRow as HTMLElement).queryByLabelText('Note for Amina Patel')).not.toBeInTheDocument()
    fireEvent.click(within(aminaRow as HTMLElement).getByRole('button', { name: 'Add note for Amina Patel' }))
    fireEvent.change(within(aminaRow as HTMLElement).getByLabelText('Note for Amina Patel'), {
      target: { value: 'At the east assembly point.' },
    })
    fireEvent.click(within(aminaRow as HTMLElement).getByRole('button', { name: 'Save note' }))
    expect(within(aminaRow as HTMLElement).queryByLabelText('Note for Amina Patel')).not.toBeInTheDocument()

    workspace = screen.getByRole('region', { name: 'Roll call' })
    aminaRow = within(workspace).getByText('Amina Patel').closest('li')
    expect(aminaRow).toHaveTextContent('At the east assembly point.')

    fireEvent.click(within(aminaRow as HTMLElement).getByRole('checkbox', { name: /Amina Patel/ }))

    workspace = screen.getByRole('region', { name: 'Roll call' })
    expect(within(workspace).getByText('0 of 13').parentElement).toHaveTextContent('0 of 13 accounted for')
    fireEvent.click(within(workspace).getByRole('button', { name: 'Hide roll call' }))
    expect(within(workspace).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({
      ok: true,
      data: {
        activeAccountability: { total: 13, accountedFor: 0, unconfirmed: 13 },
        accountabilitySession: {
          status: 'active',
          totals: { total: 13, accountedFor: 0, unconfirmed: 13 },
          records: expect.arrayContaining([expect.objectContaining({
            attendeeId: 'att_amina_patel',
            status: 'unconfirmed',
            note: 'At the east assembly point.',
          })]),
        },
      },
    })
  })

  it('lists and filters events across organisations while preserving their context', () => {
    render(<App operationsService={createTestOperationsService()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))

    expect(screen.getByText('19 events')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Friends of Willowbrook Primary · Cheltenham, Gloucestershire' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter events by organisation' }), {
      target: { value: 'org_westbrook_pta' },
    })

    expect(screen.getByText('3 events')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Family Printmaking Workshop' })).not.toBeInTheDocument()
    const publishedEventRow = screen.getByRole('heading', { level: 2, name: 'Year 6 Family Quiz Night' }).closest('article')
    expect(publishedEventRow).not.toBeNull()
    expect(within(publishedEventRow as HTMLElement).getByText('Friends of Willowbrook Primary · Cheltenham, Gloucestershire')).toBeInTheDocument()
    expect(within(publishedEventRow as HTMLElement).getByText('Status').parentElement).toHaveTextContent('Published')

    fireEvent.click(within(publishedEventRow as HTMLElement).getByRole('button', { name: 'Open' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Year 6 Family Quiz Night' })).toHaveFocus()
    expect(screen.getByText('Friends of Willowbrook Primary · Cheltenham, Gloucestershire')).toBeInTheDocument()
    expect(screen.getByText('Venue').nextElementSibling).toHaveTextContent('Willowbrook Main Hall')
    expect(screen.queryByLabelText('Current event totals')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/organisations/org_westbrook_pta/events/evt_quiz_night')
  })

  it('finds attendees and expands their grouped registration', () => {
    render(<App operationsService={createTestOperationsService()} />)
    openManagedEvent()
    const search = screen.getByPlaceholderText('Search attendees')

    fireEvent.change(search, { target: { value: 'Sarah Jenkins' } })

    expect(screen.getByText('1 match')).toBeInTheDocument()
    const sarahResult = screen.getByRole('heading', { level: 3, name: 'Sarah Jenkins' }).closest('article')
    expect(sarahResult).not.toBeNull()
    expect(within(sarahResult as HTMLElement).getByText('Registration RIV-001')).toBeInTheDocument()
    expect(within(sarahResult as HTMLElement).getByText('Not arrived')).toBeInTheDocument()

    const registrationToggle = within(sarahResult as HTMLElement)
      .getByRole('button', { name: 'View registration for Sarah Jenkins' })
    expect(registrationToggle).toHaveTextContent('')
    expect(registrationToggle.querySelector('svg')).toBeInTheDocument()
    fireEvent.click(registrationToggle)

    expect(within(sarahResult as HTMLElement).getByRole('heading', { level: 4, name: 'Registration RIV-001' })).toBeInTheDocument()
    expect(within(sarahResult as HTMLElement).getByText('Leo Jenkins')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'Jenkins' } })

    expect(screen.getByText('2 matches')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Sarah Jenkins' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Leo Jenkins' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check in Sarah Jenkins' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check in Leo Jenkins' })).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'Nobody Here' } })

    expect(screen.getByText('No attendees found.')).toBeInTheDocument()
  })

  it('shows anomaly evidence and opens the relevant registrations', () => {
    render(<App operationsService={createTestOperationsService()} />)
    openManagedEvent()

    const issues = screen.getByRole('region', { name: 'Needs attention' })
    expect(within(issues).getByText('2 issues')).toBeInTheDocument()
    expect(within(issues).getByRole('heading', { name: '4 booking places remaining' })).toBeInTheDocument()
    expect(within(issues).getByText('13 checked in · 16 registered · 20 capacity')).toBeInTheDocument()
    expect(within(issues).queryByText('Over capacity')).not.toBeInTheDocument()
    expect(within(issues).getByRole('heading', { name: 'Possible duplicate registrations' })).toBeInTheDocument()
    expect(within(issues).getByText('sarah.jenkins@example.test')).toBeInTheDocument()
    expect(within(issues).getByText('Sarah Jenkins')).toBeInTheDocument()
    expect(within(issues).getByText('RIV-001')).toBeInTheDocument()
    expect(within(issues).getByText('Priya Shah')).toBeInTheDocument()
    expect(within(issues).getByText('RIV-014')).toBeInTheDocument()

    fireEvent.click(within(issues).getByRole('button', { name: 'Review registrations' }))

    const search = screen.getByPlaceholderText('Search attendees')
    expect(search).toHaveValue('sarah.jenkins@example.test')
    expect(search).toHaveFocus()
    expect(screen.getByText('2 matches')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Sarah Jenkins' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Priya Shah' })).toBeInTheDocument()
  })

  it('checks in a selected attendee only after explicit confirmation', () => {
    const service = createTestOperationsService()
    render(<App operationsService={service} />)
    openManagedEvent()
    fireEvent.change(screen.getByPlaceholderText('Search attendees'), {
      target: { value: 'Sarah Jenkins' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Check in Sarah Jenkins' }))

    const confirmation = screen.getByRole('group', { name: 'Confirm check-in for Sarah Jenkins' })
    expect(within(confirmation).getByText('Check in Sarah Jenkins?')).toBeInTheDocument()
    expect(within(confirmation).getByText('Not arrived · Occupancy 13 → 14 of 20')).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { checkedInCount: 13 } })

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Confirm check-in' }))

    const totals = screen.getByLabelText('Current event totals')
    expect(within(totals).getByText('Checked in').nextElementSibling).toHaveTextContent('14')
    expect(screen.getByText('Sarah Jenkins checked in.')).toBeInTheDocument()
    const sarahResult = screen.getByRole('heading', { level: 3, name: 'Sarah Jenkins' }).closest('article')
    expect(within(sarahResult as HTMLElement).getByText('Checked in')).toBeInTheDocument()
    expect(within(sarahResult as HTMLElement).queryByRole('button', { name: 'Check in Sarah Jenkins' })).not.toBeInTheDocument()

    const activity = screen.getByRole('heading', { level: 2, name: 'Activity' }).closest('details')
    expect(activity).not.toBeNull()
    fireEvent.click(within(activity as HTMLElement).getByText('Activity'))
    expect(within(activity as HTMLElement).getByText('Attendee checked in')).toBeInTheDocument()
    expect(within(activity as HTMLElement).getByText('Sarah Jenkins')).toBeInTheDocument()
    expect(within(activity as HTMLElement).getByText('Checked in · 14 of 20.')).toBeInTheDocument()
    expect(within(activity as HTMLElement).getByText('Human · Event manager')).toBeInTheDocument()
    expect(within(activity as HTMLElement).getByText('Completed')).toBeInTheDocument()
    expect(within(activity as HTMLElement).getByText('5 Sept, 18:30')).toBeInTheDocument()
  })

  it('validates and cancels an event draft without persisting it', () => {
    const service = createTestOperationsService()
    render(<App operationsService={service} />)
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }))

    fireEvent.change(screen.getByLabelText('Organisation'), { target: { value: 'org_lantern_rooms' } })
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Community Supper' } })
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2026-10-10T18:30' } })
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'Riverside Hall' } })
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review event' }))

    expect(screen.getByText('Capacity must be a whole number of at least 1.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm event' })).not.toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { createdEvents: [] } })

    fireEvent.change(screen.getByRole('spinbutton', { name: /Capacity/ }), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review event' }))
    expect(screen.getByRole('heading', { name: 'Review event' })).toBeInTheDocument()
    expect(screen.getByText('Capacity is low; check it before creating the event.')).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { createdEvents: [] } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel draft' }))

    expect(screen.queryByRole('heading', { name: 'Create event' })).not.toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { createdEvents: [] } })
  })

  it('confirms exactly one reviewed event and opens its persisted details', () => {
    const service = createTestOperationsService()
    render(<App operationsService={service} />)
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }))

    fireEvent.change(screen.getByLabelText('Organisation'), { target: { value: 'org_westbrook_pta' } })
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: '  Family   Games Night ' } })
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2026-10-10T18:30' } })
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: '  Main   Hall ' } })
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review event' }))

    const review = screen.getByRole('heading', { name: 'Review event' }).closest('div')
    expect(review).not.toBeNull()
    expect(within(review as HTMLElement).getByText('Family Games Night')).toBeInTheDocument()
    expect(within(review as HTMLElement).getByText('Friends of Willowbrook Primary · Cheltenham, Gloucestershire')).toBeInTheDocument()
    expect(within(review as HTMLElement).getByText('Main Hall')).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { revision: 0, createdEvents: [] } })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm event' }))

    expect(screen.getByText('Event created.')).toBeInTheDocument()
    const createdEventRow = screen.getByRole('heading', { level: 2, name: 'Family Games Night' }).closest('article')
    expect(createdEventRow).not.toBeNull()
    expect(screen.getByText('20 events')).toBeInTheDocument()
    expect(within(createdEventRow as HTMLElement).getByText('Friends of Willowbrook Primary · Cheltenham, Gloucestershire')).toBeInTheDocument()
    expect(within(createdEventRow as HTMLElement).getByText('10 Oct 2026, 18:30')).toBeInTheDocument()
    expect(within(createdEventRow as HTMLElement).getByText('Capacity').parentElement).toHaveTextContent('40')
    expect(within(createdEventRow as HTMLElement).getByText('Status').parentElement).toHaveTextContent('Not started')
    expect(service.getSnapshot()).toMatchObject({
      ok: true,
      data: {
        revision: 1,
        createdEvents: [{ organisationId: 'org_westbrook_pta', name: 'Family Games Night', venue: 'Main Hall', capacity: 40 }],
      },
    })

    fireEvent.click(within(createdEventRow as HTMLElement).getByRole('button', { name: 'Open' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Family Games Night' })).toHaveFocus()
    expect(screen.queryByText('event_2')).not.toBeInTheDocument()
    expect(screen.getByText('Friends of Willowbrook Primary · Cheltenham, Gloucestershire')).toBeInTheDocument()
    expect(screen.getByText('Venue').nextElementSibling).toHaveTextContent('Main Hall')
    expect(window.location.pathname).toBe('/organisations/org_westbrook_pta/events/event_2')
  })

  it('updates live totals and announces shared service changes without a page refresh', () => {
    const service = createTestOperationsService()
    render(<App operationsService={service} />)
    openManagedEvent()
    const initialTotals = screen.getByLabelText('Current event totals')
    expect(within(initialTotals).getByText('Capacity remaining').nextElementSibling).toHaveTextContent('7')

    act(() => {
      const result = service.checkInAttendee({
        attendeeId: 'att_sarah_jenkins',
        actor: organiser,
        reason: 'Confirmed exception.',
      })
      expect(result.ok).toBe(true)
    })

    const totals = screen.getByLabelText('Current event totals')
    expect(within(totals).getByText('Checked in').nextElementSibling).toHaveTextContent('14')
    expect(within(totals).getByText('Not arrived').nextElementSibling).toHaveTextContent('2')
    expect(within(totals).getByText('Capacity remaining').nextElementSibling).toHaveTextContent('6')
    expect(screen.getByText('Current').parentElement).toHaveTextContent('Updated 18:30')
    expect(screen.getAllByRole('status')[0]).toHaveTextContent(
      'Riverside Community Workshop updated. 14 checked in, 2 not arrived.',
    )
  })

  it('shows refreshing and stale states when a snapshot refresh is unresolved or fails', async () => {
    const baseService = createTestOperationsService()
    const initialResult = baseService.getSnapshot()
    const failedResult = {
      ok: false as const,
      error: {
        code: 'persistence_failed' as const,
        message: 'The event operation could not be saved.',
        remediation: 'No changes were saved. Check browser storage and retry.',
      },
    }
    const service: EventOperationsService = {
      ...baseService,
      getSnapshot: vi.fn()
        .mockReturnValueOnce(initialResult)
        .mockReturnValueOnce(failedResult),
    }
    let finishRefresh: FrameRequestCallback | null = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      finishRefresh = callback
      return 1
    })
    render(<App operationsService={service} />)
    openManagedEvent()

    const refresh = screen.getByRole('button', { name: 'Refresh live data' })
    fireEvent.click(refresh)

    expect(screen.getByText('Refreshing')).toBeInTheDocument()
    expect(refresh).toBeDisabled()
    expect(screen.getByText('Refreshing').parentElement).toHaveTextContent('Updated 18:14')

    await act(async () => {
      finishRefresh?.(0)
      await Promise.resolve()
    })

    expect(screen.getByText('Stale')).toBeInTheDocument()
    expect(refresh).not.toBeDisabled()
  })

  it('clears stale anomaly warnings when a refreshed snapshot has none', async () => {
    const baseService = createTestOperationsService()
    const initialResult = baseService.getSnapshot()
    if (!initialResult.ok) throw new Error('Expected initial snapshot')
    const resolvedResult = {
      ok: true as const,
      data: { ...initialResult.data, anomalies: [] },
    }
    const service: EventOperationsService = {
      ...baseService,
      getSnapshot: vi.fn()
        .mockReturnValueOnce(initialResult)
        .mockReturnValueOnce(resolvedResult),
    }
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    render(<App operationsService={service} />)
    openManagedEvent()
    expect(screen.getByRole('heading', { name: '4 booking places remaining' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh live data' }))
      await Promise.resolve()
    })

    expect(screen.queryByRole('heading', { name: '4 booking places remaining' })).not.toBeInTheDocument()
    expect(screen.getByText('No issues detected.')).toBeInTheDocument()
    expect(screen.getByText('0 issues')).toBeInTheDocument()
  })

  it('resets changed persisted and visible state from the site header while an event is open', () => {
    const service = createTestOperationsService()
    expect(service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    expect(service.startAccountability({ actor: organiser }).ok).toBe(true)
    render(<App operationsService={service} />)
    openOrganisation('Willowbrook Primary School')
    const eventRow = screen.getByRole('heading', { name: 'Willowbrook Autumn Fair' }).closest('article')
    fireEvent.click(within(eventRow as HTMLElement).getByRole('button', { name: 'View event' }))
    const eventDialog = screen.getByRole('dialog', { name: 'Willowbrook Autumn Fair' })
    expect(within(eventDialog).queryByRole('button', { name: 'Reset demo' })).not.toBeInTheDocument()
    fireEvent.click(within(eventDialog).getByRole('button', { name: 'Book free tickets' }))
    fireEvent.change(within(eventDialog).getByLabelText('Your name'), { target: { value: 'Alex Morgan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Find events in your community' })).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({
      ok: true,
      data: { checkedInCount: 13, notArrivedCount: 3, activeAccountability: null },
    })

    openOrganisation('Willowbrook Primary School')
    const resetEventRow = screen.getByRole('heading', { name: 'Willowbrook Autumn Fair' }).closest('article')
    fireEvent.click(within(resetEventRow as HTMLElement).getByRole('button', { name: 'View event' }))
    const restoredEventDialog = screen.getByRole('dialog', { name: 'Willowbrook Autumn Fair' })
    fireEvent.click(within(restoredEventDialog).getByRole('button', { name: 'Book free tickets' }))
    expect(within(restoredEventDialog).getByLabelText('Your name')).toHaveValue('')
  })

  it('shows a recoverable reset error without claiming success when persistence fails', () => {
    const harness = createTestOperationsHarness()
    expect(harness.service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    render(<App operationsService={harness.service} />)
    openManagedEvent()
    harness.failNextWrite()

    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))

    expect(alert).toHaveBeenCalledWith('Reset failed. Please try again.')
    expect(screen.getByRole('alert')).toHaveTextContent('Reset failed. Please try again.')
    expect(harness.service.getSnapshot()).toMatchObject({ ok: true, data: { checkedInCount: 14 } })
    const activity = screen.getByRole('heading', { level: 2, name: 'Activity' }).closest('details')
    fireEvent.click(within(activity as HTMLElement).getByText('Activity'))
    expect(within(activity as HTMLElement).getByText('Demo reset')).toBeInTheDocument()
    expect(within(activity as HTMLElement).getByText('Reset was not saved.')).toBeInTheDocument()
    expect(within(activity as HTMLElement).getByText('Failed')).toBeInTheDocument()
  })

  it('recovers from a stale event link without selecting another event', () => {
    window.history.replaceState(null, '', '/organisations/missing-organisation/events/missing-event')

    render(<App operationsService={createTestOperationsService()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Event not found' })).toHaveFocus()
    expect(screen.getByText('This organisation or event is unavailable.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Current event totals')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Events' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Back to events' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toHaveFocus()
    expect(window.location.pathname).toBe('/events')
  })

  it('does not open an event under a different organisation or a legacy unscoped route', () => {
    window.history.replaceState(null, '', '/organisations/org_st_lukes/events/evt_autumn_fair')
    const { unmount } = render(<App operationsService={createTestOperationsService()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Event not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Willowbrook Autumn Fair' })).not.toBeInTheDocument()

    unmount()
    window.history.replaceState(null, '', '/events/evt_riverside_community_workshop')
    render(<App operationsService={createTestOperationsService()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Event not found' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Current event totals')).not.toBeInTheDocument()
  })

  it('searches organisation attributes and their event catalogue', () => {
    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('Search organisations, places or events'), {
      target: { value: 'coding' },
    })

    expect(screen.getByRole('heading', { name: 'Severnside Youth Project' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Willowbrook Primary School' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search organisations, places or events'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Church' }))

    expect(screen.getByRole('heading', { name: 'St Cuthbert’s Parish Church' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'The Old Market Rooms' })).not.toBeInTheDocument()
  })

  it('scopes event discovery and booking beneath the selected organisation', () => {
    render(<App />)
    openOrganisation('Willowbrook Primary School')

    expect(screen.getByRole('heading', { level: 1, name: 'Willowbrook Primary School' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Willowbrook Autumn Fair' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Online Safety for Families' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Year 6 Family Quiz Night' })).not.toBeInTheDocument()

    const eventRow = screen.getByRole('heading', { name: 'Willowbrook Autumn Fair' }).closest('article')
    fireEvent.click(within(eventRow as HTMLElement).getByRole('button', { name: 'View event' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Hosted by Willowbrook Primary School · Cheltenham, Gloucestershire')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Book free tickets' }))
    fireEvent.change(within(dialog).getByLabelText('Your name'), { target: { value: 'Alex Morgan' } })
    fireEvent.change(within(dialog).getByLabelText(/Email address/), { target: { value: 'alex@example.test' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /review booking/i }))

    expect(within(dialog).getByText('Willowbrook Primary School · Cheltenham, Gloucestershire')).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Check your booking' })).toBeInTheDocument()
  })
})
