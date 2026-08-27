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

afterEach(() => {
  vi.restoreAllMocks()
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

  it('opens event management directly', () => {
    render(<App />)

    expect(screen.getByText('Attendly-webMCP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attendly-webMCP home' })).toBeInTheDocument()

    const publicEvents = screen.getByRole('button', { name: 'Public events' })
    const events = screen.getByRole('button', { name: 'Events' })
    expect(publicEvents).toHaveAttribute('aria-current', 'page')
    events.focus()
    expect(events).toHaveFocus()
    fireEvent.click(events)

    expect(screen.getByRole('heading', { level: 1, name: 'Riverside Community Workshop' })).toHaveFocus()
    expect(screen.getByText('Event management')).toBeInTheDocument()
    expect(events).toHaveAttribute('aria-current', 'page')
    const totals = screen.getByLabelText('Current event totals')
    expect(within(totals).getByText('Registered').nextElementSibling).toHaveTextContent('16')
    expect(within(totals).getByText('Checked in').nextElementSibling).toHaveTextContent('13')
    const refresh = screen.getByRole('button', { name: 'Refresh live data' })
    expect(refresh).toHaveTextContent('')
    expect(refresh.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse public events' })).toBeInTheDocument()
  })

  it('finds attendees and expands their grouped registration', () => {
    render(<App operationsService={createTestOperationsService()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))
    const search = screen.getByPlaceholderText('Search attendees')

    fireEvent.change(search, { target: { value: 'Sarah Jenkins' } })

    expect(screen.getByText('1 match')).toBeInTheDocument()
    const sarahResult = screen.getByRole('heading', { level: 3, name: 'Sarah Jenkins' }).closest('article')
    expect(sarahResult).not.toBeNull()
    expect(within(sarahResult as HTMLElement).getByText('Registration RIV-001')).toBeInTheDocument()
    expect(within(sarahResult as HTMLElement).getByText('Not arrived')).toBeInTheDocument()

    fireEvent.click(within(sarahResult as HTMLElement).getByRole('button', { name: 'View registration for Sarah Jenkins' }))

    expect(within(sarahResult as HTMLElement).getByRole('heading', { level: 4, name: 'Registration RIV-001' })).toBeInTheDocument()
    expect(within(sarahResult as HTMLElement).getByText('Leo Jenkins')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'Jenkins' } })

    expect(screen.getByText('2 matches')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Sarah Jenkins' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Leo Jenkins' })).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'Nobody Here' } })

    expect(screen.getByText('No attendees found.')).toBeInTheDocument()
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
    expect(screen.getByRole('article', { name: 'Family Games Night' })).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({
      ok: true,
      data: {
        revision: 1,
        createdEvents: [{ name: 'Family Games Night', venue: 'Main Hall', capacity: 40 }],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close event' }))
    expect(screen.queryByRole('article', { name: 'Family Games Night' })).not.toBeInTheDocument()
    const createdEvents = screen.getByRole('heading', { name: 'Created events' }).closest('div')
    fireEvent.click(within(createdEvents as HTMLElement).getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('article', { name: 'Family Games Night' })).toBeInTheDocument()
  })

  it('updates live totals and announces shared service changes without a page refresh', () => {
    const service = createTestOperationsService()
    render(<App operationsService={service} />)
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))

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
    expect(screen.getByRole('status')).toHaveTextContent(
      'Riverside Community Workshop updated. 14 checked in, 2 not arrived.',
    )
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

  it('resets changed persisted and visible state from an open event', () => {
    const service = createTestOperationsService()
    expect(service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    expect(service.startAccountability({ actor: organiser }).ok).toBe(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App operationsService={service} />)
    openOrganisation('Westbrook Primary School')
    const eventRow = screen.getByRole('heading', { name: 'Westbrook Autumn Fair' }).closest('article')
    fireEvent.click(within(eventRow as HTMLElement).getByRole('button', { name: 'View event' }))
    const eventDialog = screen.getByRole('dialog', { name: 'Westbrook Autumn Fair' })
    fireEvent.click(within(eventDialog).getByRole('button', { name: 'Book free tickets' }))
    fireEvent.change(within(eventDialog).getByLabelText('Your name'), { target: { value: 'Alex Morgan' } })
    fireEvent.click(within(eventDialog).getByRole('button', { name: 'Reset demo' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Events' }))
    harness.failNextWrite()

    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))

    expect(alert).toHaveBeenCalledWith('Reset failed. Please try again.')
    expect(screen.getByRole('alert')).toHaveTextContent('Reset failed. Please try again.')
    expect(harness.service.getSnapshot()).toMatchObject({ ok: true, data: { checkedInCount: 14 } })
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
