import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

describe('Attendly organisation directory', () => {
  it('presents organisations as the top-level entities', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Find events in your community' })).toBeInTheDocument()
    expect(screen.getByText('6 organisations · 18 events')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Westbrook Primary School' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'St Luke’s Community Church' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Westbrook Autumn Fair' })).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/fictional and use synthetic data/i)
  })

  it('identifies the demonstration and opens the primary operations workspace directly', () => {
    render(<App />)

    expect(screen.getByText('Attendly-webMCP')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attendly-webMCP home' })).toBeInTheDocument()

    const publicEvents = screen.getByRole('button', { name: 'Public events' })
    const liveOperations = screen.getByRole('button', { name: 'Live operations' })
    expect(publicEvents).toHaveAttribute('aria-current', 'page')
    liveOperations.focus()
    expect(liveOperations).toHaveFocus()
    fireEvent.click(liveOperations)

    expect(screen.getByRole('heading', { level: 1, name: 'Riverside Community Workshop' })).toHaveFocus()
    expect(liveOperations).toHaveAttribute('aria-current', 'page')
    const totals = screen.getByLabelText('Current event totals')
    expect(within(totals).getByText('Registered').nextElementSibling).toHaveTextContent('16')
    expect(within(totals).getByText('Checked in').nextElementSibling).toHaveTextContent('13')
    expect(screen.getByRole('button', { name: 'Refresh live state' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse public events' })).toBeInTheDocument()
  })

  it('updates live totals and announces shared service changes without a page refresh', () => {
    const service = createTestOperationsService()
    render(<App operationsService={service} />)
    fireEvent.click(screen.getByRole('button', { name: 'Live operations' }))

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
    render(<App operationsService={service} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    const dialog = screen.getByRole('dialog', { name: 'Reset the demo?' })
    expect(within(dialog).getByText(/all current demo changes will be discarded/i)).toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { checkedInCount: 14 } })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Reset the demo?' })).not.toBeInTheDocument()
    expect(service.getSnapshot()).toMatchObject({ ok: true, data: { checkedInCount: 14 } })
    expect(screen.queryByText(/demo reset complete/i)).not.toBeInTheDocument()
  })

  it('resets changed persisted and visible state from an open event', () => {
    const service = createTestOperationsService()
    expect(service.checkInAttendee({ attendeeId: 'att_sarah_jenkins', actor: organiser }).ok).toBe(true)
    expect(service.startAccountability({ actor: organiser }).ok).toBe(true)
    render(<App operationsService={service} />)
    openOrganisation('Westbrook Primary School')
    const eventRow = screen.getByRole('heading', { name: 'Westbrook Autumn Fair' }).closest('article')
    fireEvent.click(within(eventRow as HTMLElement).getByRole('button', { name: 'View event' }))
    const eventDialog = screen.getByRole('dialog', { name: 'Westbrook Autumn Fair' })
    fireEvent.click(within(eventDialog).getByRole('button', { name: 'Book free tickets' }))
    fireEvent.change(within(eventDialog).getByLabelText('Your name'), { target: { value: 'Alex Morgan' } })
    fireEvent.click(within(eventDialog).getByRole('button', { name: 'Reset demo' }))

    const resetDialog = screen.getByRole('dialog', { name: 'Reset the demo?' })
    fireEvent.click(within(resetDialog).getByRole('button', { name: 'Reset synthetic demo' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Find events in your community' })).toBeInTheDocument()
    expect(screen.getByText('Demo reset complete. The deterministic synthetic data is ready.', {
      selector: '.reset-feedback',
    })).toBeInTheDocument()
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
    render(<App operationsService={harness.service} />)
    fireEvent.click(screen.getByRole('button', { name: 'Live operations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    harness.failNextWrite()

    const dialog = screen.getByRole('dialog', { name: 'Reset the demo?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset synthetic demo' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'The event operation could not be saved. No changes were saved. Check browser storage and retry.',
    )
    expect(screen.queryByText(/demo reset complete/i)).not.toBeInTheDocument()
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
