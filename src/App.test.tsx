import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createEventOperationsService, type EventOperationsService } from './application/eventOperationsService'
import { createPersistentEventOperationsStore } from './application/eventOperationsStore'
import { createDemoEventOperationsState } from './demo/seed'
import type { OperationsActor } from './domain/eventOperations'

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
})

describe('Attendly organisation directory', () => {
  it('presents organisations as the top-level entities', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Find events in your community' })).toBeInTheDocument()
    expect(screen.getByText('6 organisations · 18 events')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Westbrook Primary School' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'St Luke’s Community Church' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Westbrook Autumn Fair' })).not.toBeInTheDocument()
    expect(screen.queryByText(/synthetic demo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fictional and use synthetic data/i)).not.toBeInTheDocument()
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
    expect(screen.getByText('Event management')).toBeInTheDocument()
    expect(screen.queryByText('Event ID')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Current workspace context')).toHaveTextContent('evt_riverside_community_workshop')
    expect(window.location.pathname).toBe('/events/evt_riverside_community_workshop')
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

  it('lists the organiser’s published events without opening Riverside operations for them', () => {
    render(<App operationsService={createTestOperationsService()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))

    expect(screen.getByText('4 events')).toBeInTheDocument()
    const publishedEventRow = screen.getByRole('heading', { level: 2, name: 'Family Printmaking Workshop' }).closest('article')
    expect(publishedEventRow).not.toBeNull()
    expect(within(publishedEventRow as HTMLElement).getByText('Status').parentElement).toHaveTextContent('Published')

    fireEvent.click(within(publishedEventRow as HTMLElement).getByRole('button', { name: 'Open' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Family Printmaking Workshop' })).toHaveFocus()
    expect(screen.getByText('Venue').nextElementSibling).toHaveTextContent('Studio One')
    expect(screen.queryByLabelText('Current event totals')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/events/evt_print_workshop')
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
    expect(within(confirmation).getByText('Occupancy 14 of 20')).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { checkedInCount: 13 } })

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Confirm check-in' }))

    const totals = screen.getByLabelText('Current event totals')
    expect(within(totals).getByText('Checked in').nextElementSibling).toHaveTextContent('14')
    expect(screen.getByText('Sarah Jenkins checked in.')).toBeInTheDocument()
    const sarahResult = screen.getByRole('heading', { level: 3, name: 'Sarah Jenkins' }).closest('article')
    expect(within(sarahResult as HTMLElement).getByText('Checked in')).toBeInTheDocument()
    expect(within(sarahResult as HTMLElement).queryByRole('button', { name: 'Check in Sarah Jenkins' })).not.toBeInTheDocument()
  })

  it('validates and cancels an event draft without persisting it', () => {
    const service = createTestOperationsService()
    render(<App operationsService={service} />)
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }))

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

    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: '  Family   Games Night ' } })
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2026-10-10T18:30' } })
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: '  Main   Hall ' } })
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review event' }))

    const review = screen.getByRole('heading', { name: 'Review event' }).closest('div')
    expect(review).not.toBeNull()
    expect(within(review as HTMLElement).getByText('Family Games Night')).toBeInTheDocument()
    expect(within(review as HTMLElement).getByText('Main Hall')).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { revision: 0, createdEvents: [] } })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm event' }))

    expect(screen.getByText('Event created.')).toBeInTheDocument()
    const createdEventRow = screen.getByRole('heading', { level: 2, name: 'Family Games Night' }).closest('article')
    expect(createdEventRow).not.toBeNull()
    expect(screen.getByText('5 events')).toBeInTheDocument()
    expect(within(createdEventRow as HTMLElement).getByText('10 Oct 2026, 18:30')).toBeInTheDocument()
    expect(within(createdEventRow as HTMLElement).getByText('Capacity').parentElement).toHaveTextContent('40')
    expect(within(createdEventRow as HTMLElement).getByText('Status').parentElement).toHaveTextContent('Not started')
    expect(service.getSnapshot()).toMatchObject({
      ok: true,
      data: {
        revision: 1,
        createdEvents: [{ name: 'Family Games Night', venue: 'Main Hall', capacity: 40 }],
      },
    })

    fireEvent.click(within(createdEventRow as HTMLElement).getByRole('button', { name: 'Open' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Family Games Night' })).toHaveFocus()
    expect(screen.getByText('Event ID').parentElement).toHaveTextContent('event_2')
    expect(screen.getByText('Venue').nextElementSibling).toHaveTextContent('Main Hall')
    expect(window.location.pathname).toBe('/events/event_2')
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

  it('does not reset persisted state before confirmation and supports cancellation', () => {
    const service = createTestOperationsService()
    expect(service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    const confirmReset = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App operationsService={service} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))

    expect(confirmReset).toHaveBeenCalledWith('Reset demo?')
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { checkedInCount: 14 } })
  })

  it('resets changed persisted and visible state from the site header while an event is open', () => {
    const service = createTestOperationsService()
    expect(service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    expect(service.startAccountability({ actor: organiser }).ok).toBe(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App operationsService={service} />)
    openOrganisation('Westbrook Primary School')
    const eventRow = screen.getByRole('heading', { name: 'Westbrook Autumn Fair' }).closest('article')
    fireEvent.click(within(eventRow as HTMLElement).getByRole('button', { name: 'View event' }))
    const eventDialog = screen.getByRole('dialog', { name: 'Westbrook Autumn Fair' })
    expect(within(eventDialog).queryByRole('button', { name: 'Reset demo' })).not.toBeInTheDocument()
    fireEvent.click(within(eventDialog).getByRole('button', { name: 'Book free tickets' }))
    fireEvent.change(within(eventDialog).getByLabelText('Your name'), { target: { value: 'Alex Morgan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Find events in your community' })).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({
      ok: true,
      data: { checkedInCount: 13, notArrivedCount: 3, activeAccountability: null },
    })

    openOrganisation('Westbrook Primary School')
    const resetEventRow = screen.getByRole('heading', { name: 'Westbrook Autumn Fair' }).closest('article')
    fireEvent.click(within(resetEventRow as HTMLElement).getByRole('button', { name: 'View event' }))
    const restoredEventDialog = screen.getByRole('dialog', { name: 'Westbrook Autumn Fair' })
    fireEvent.click(within(restoredEventDialog).getByRole('button', { name: 'Book free tickets' }))
    expect(within(restoredEventDialog).getByLabelText('Your name')).toHaveValue('')
  })

  it('shows a recoverable reset error without claiming success when persistence fails', () => {
    const harness = createTestOperationsHarness()
    expect(harness.service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    render(<App operationsService={harness.service} />)
    openManagedEvent()
    harness.failNextWrite()

    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))

    expect(alert).toHaveBeenCalledWith('Reset failed. Please try again.')
    expect(screen.getByRole('alert')).toHaveTextContent('Reset failed. Please try again.')
    expect(harness.service.getSnapshot()).toMatchObject({ ok: true, data: { checkedInCount: 14 } })
  })

  it('recovers from a stale event link without selecting another event', () => {
    window.history.replaceState(null, '', '/events/missing-event')

    render(<App operationsService={createTestOperationsService()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Event not found' })).toHaveFocus()
    expect(screen.getByText('missing-event').parentElement).toHaveTextContent('No event exists with ID missing-event.')
    expect(screen.queryByLabelText('Current event totals')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Events' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Back to events' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toHaveFocus()
    expect(window.location.pathname).toBe('/events')
  })

  it('searches organisation attributes and their event catalogue', () => {
    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('Search organisations, places or events'), {
      target: { value: 'coding' },
    })

    expect(screen.getByRole('heading', { name: 'Harbour Youth Project' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Westbrook Primary School' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search organisations, places or events'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Church' }))

    expect(screen.getByRole('heading', { name: 'St Luke’s Community Church' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'The Lantern Rooms' })).not.toBeInTheDocument()
  })

  it('scopes event discovery and booking beneath the selected organisation', () => {
    render(<App />)
    openOrganisation('Westbrook Primary School')

    expect(screen.getByRole('heading', { level: 1, name: 'Westbrook Primary School' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Westbrook Autumn Fair' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Online Safety for Families' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Year 6 Family Quiz Night' })).not.toBeInTheDocument()

    const eventRow = screen.getByRole('heading', { name: 'Westbrook Autumn Fair' }).closest('article')
    fireEvent.click(within(eventRow as HTMLElement).getByRole('button', { name: 'View event' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Hosted by Westbrook Primary School')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Book free tickets' }))
    fireEvent.change(within(dialog).getByLabelText('Your name'), { target: { value: 'Alex Morgan' } })
    fireEvent.change(within(dialog).getByLabelText(/Email address/), { target: { value: 'alex@example.test' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /review booking/i }))

    expect(within(dialog).getByText('Westbrook Primary School')).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Check your booking' })).toBeInTheDocument()
  })
})
