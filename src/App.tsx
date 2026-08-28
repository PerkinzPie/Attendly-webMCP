import { type FormEvent, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { getDemoEventOperationsService } from './application/demoEventOperations'
import type {
  EventOperationsService,
  EventOperationsServiceSnapshot,
} from './application/eventOperationsService'
import type {
  ActivityEntry,
  AttendeeCheckInReview,
  AttendeeSearchResult,
  CreatedEvent,
  EventDraft,
} from './domain/eventOperations'
import {
  demoEvents,
  demoManagedEvents,
  demoOrganisations,
  getOrganisationEvents,
  organisationTypes,
  type DemoEvent,
  type DemoOrganisation,
  type EventCategory,
  type OrganisationType,
} from './demo/seed'
import {
  createEventPreparationTools,
  type ManagedEventToolRecord,
} from './webmcp/eventPreparationTools'
import {
  hasWebMcpSupport,
  registerWebMcpTools,
  webMcpCompatibilityGuidance,
} from './webmcp/browserAdapter'
import { createEventContextTools } from './webmcp/eventContextTools'

type IconName = 'arrow' | 'calendar' | 'check' | 'clock' | 'close' | 'location' | 'refresh' | 'search' | 'ticket'
type BookingStage = 'event' | 'details' | 'review' | 'confirmed'
type OrganisationFilter = 'All organisations' | OrganisationType
type EventFilter = 'All events' | EventCategory
type AppSurface = 'directory' | 'events'
type SnapshotRefreshState = 'fresh' | 'refreshing' | 'stale'

type AppRoute = {
  readonly surface: AppSurface
  readonly organisationId: string | null
  readonly eventId: string | null
}

const organisationsById = new Map(demoOrganisations.map((organisation) => [organisation.id, organisation]))

function formatOrganisationContext(organisation: DemoOrganisation) {
  return `${organisation.name} · ${organisation.location}`
}

const demoUiActor = {
  id: 'actor_demo_demonstrator',
  displayName: 'Event manager',
  channel: 'human-ui',
  isSynthetic: true,
} as const

const demoToolActor = {
  id: 'actor_attendly_site_tool',
  displayName: 'Attendly site tool',
  channel: 'webmcp',
  isSynthetic: true,
} as const

function readAppRoute(): AppRoute {
  const eventMatch = /^\/organisations\/([^/]+)\/events\/([^/]+)\/?$/.exec(window.location.pathname)
  if (eventMatch) {
    try {
      return {
        surface: 'events',
        organisationId: decodeURIComponent(eventMatch[1]),
        eventId: decodeURIComponent(eventMatch[2]),
      }
    } catch {
      return { surface: 'events', organisationId: eventMatch[1], eventId: eventMatch[2] }
    }
  }
  const legacyEventMatch = /^\/events\/([^/]+)\/?$/.exec(window.location.pathname)
  if (legacyEventMatch) return { surface: 'events', organisationId: null, eventId: legacyEventMatch[1] }
  if (/^\/events\/?$/.test(window.location.pathname)) {
    return { surface: 'events', organisationId: null, eventId: null }
  }
  return { surface: 'directory', organisationId: null, eventId: null }
}

function pushAppPath(path: string) {
  if (window.location.pathname !== path) window.history.pushState(null, '', path)
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.34 5.66" /><path d="M20 5v6h-6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    ticket: <path d="M4 6h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7a1 1 0 0 1 1-1Z" />,
  }

  return (
    <svg aria-hidden="true" className="icon" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{paths[name]}</g>
    </svg>
  )
}

function SearchField({ label, placeholder, value, onChange, inputRef }: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  return (
    <label className="search-field">
      <span className="sr-only">{label}</span>
      <Icon name="search" size={20} />
      <input ref={inputRef} type="search" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function OrganisationRow({ organisation, onSelect }: {
  organisation: DemoOrganisation
  onSelect: (organisation: DemoOrganisation) => void
}) {
  const events = getOrganisationEvents(organisation.id)
  const nextEvent = events[0]

  return (
    <article className="organisation-row">
      <div className="organisation-avatar" aria-hidden="true">{organisation.initials}</div>
      <div className="organisation-main">
        <div className="organisation-meta">
          <span className="type-label">{organisation.type}</span>
          <span><Icon name="location" size={15} /> {organisation.location}</span>
        </div>
        <h2>{organisation.name}</h2>
        <p>{organisation.description}</p>
      </div>
      <div className="organisation-next">
        <span>{events.length} upcoming events</span>
        <strong>Next: {nextEvent.name}</strong>
        <small>{nextEvent.dateLabel}</small>
      </div>
      <button className="text-action" type="button" onClick={() => onSelect(organisation)}>
        View events <Icon name="arrow" />
      </button>
    </article>
  )
}

function EventDate({ event }: { event: DemoEvent }) {
  return (
    <time className="event-date" dateTime={event.startsAt}>
      <span>{event.dateShort.month}</span>
      <strong>{event.dateShort.day}</strong>
    </time>
  )
}

function EventRow({ event, onSelect }: { event: DemoEvent; onSelect: (event: DemoEvent) => void }) {
  const nearlyFull = event.capacity - event.reservedTickets <= 10

  return (
    <article className="event-row">
      <EventDate event={event} />
      <div className="event-row-content">
        <div className="event-row-topline">
          <span className="type-label">{event.category}</span>
          {nearlyFull ? <span className="availability-warning">Filling quickly</span> : null}
        </div>
        <h3>{event.name}</h3>
        <p>{event.summary}</p>
        <div className="event-meta">
          <span><Icon name="clock" /> {event.timeLabel}</span>
          <span><Icon name="location" /> {event.venue}</span>
          <span><Icon name="ticket" /> {event.availabilityLabel}</span>
        </div>
      </div>
      <button className="text-action" type="button" onClick={() => onSelect(event)}>
        View event <Icon name="arrow" />
      </button>
    </article>
  )
}

function formatEventDate(startsAt: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(startsAt))
}

function formatUpdatedTime(updatedAt: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(updatedAt))
}

function formatActivityTime(occurredAt: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(occurredAt))
}

function getActivityActionLabel(action: ActivityEntry['action']) {
  const labels: Record<ActivityEntry['action'], string> = {
    'attendee-checked-in': 'Attendee checked in',
    'accountability-started': 'Accountability started',
    'accountability-status-recorded': 'Accountability updated',
    'event-created': 'Event created',
    'demo-reset': 'Demo reset',
  }

  return labels[action]
}

function getManagedEvents(snapshot: EventOperationsServiceSnapshot | null): readonly ManagedEventToolRecord[] {
  return [
    ...demoManagedEvents.map((event) => ({
      id: event.id,
      organisationId: event.organisationId,
      organisationName: organisationsById.get(event.organisationId)?.name ?? '',
      organisationLocation: organisationsById.get(event.organisationId)?.location ?? '',
      name: event.id === snapshot?.event.id ? snapshot.event.name : event.name,
      startsAt: event.id === snapshot?.event.id ? snapshot.event.startsAt : event.startsAt,
      venue: event.id === snapshot?.event.id ? snapshot.event.venue : event.venue,
      capacity: event.id === snapshot?.event.id ? snapshot.event.capacity : event.capacity,
      state: event.id === snapshot?.event.id
        ? snapshot.checkedInCount > 0 ? 'Check-in open' : 'Not started'
        : 'Published',
    })),
    ...(snapshot?.createdEvents.map((event) => ({
      id: event.id,
      organisationId: event.organisationId,
      organisationName: organisationsById.get(event.organisationId)?.name ?? '',
      organisationLocation: organisationsById.get(event.organisationId)?.location ?? '',
      name: event.name,
      startsAt: event.startsAt,
      venue: event.venue,
      capacity: event.capacity,
      state: 'Not started',
    })) ?? []),
  ].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
}

function webMcpResult<T>(message: string, structuredContent: T) {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent,
  }
}

function webMcpError(code: string, message: string) {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { ok: false, error: { code, message } },
    isError: true,
  }
}

function EventCreationWorkspace({
  organisations,
  draft,
  onPrepareDraft,
  onConfirmDraft,
  onDraftChange,
  onClose,
}: {
  organisations: readonly DemoOrganisation[]
  draft: EventDraft | null
  onPrepareDraft: EventOperationsService['prepareEventDraft']
  onConfirmDraft: EventOperationsService['confirmEventDraft']
  onDraftChange: (draft: EventDraft | null) => void
  onClose: () => void
}) {
  const [organisationId, setOrganisationId] = useState('')
  const [name, setName] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [venue, setVenue] = useState('')
  const [capacity, setCapacity] = useState('')
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [serviceError, setServiceError] = useState<string | null>(null)

  const updateField = (update: () => void) => {
    update()
    onDraftChange(null)
    setServiceError(null)
  }

  const prepareDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = onPrepareDraft({
      organisationId,
      name,
      startsAt,
      venue,
      capacity: Number(capacity),
    })

    if (!result.ok) {
      setServiceError(`${result.error.message} ${result.error.remediation}`)
      return
    }

    onDraftChange(result.data)
    setServiceError(null)
  }

  const cancelDraft = () => {
    onDraftChange(null)
    setOrganisationId('')
    setName('')
    setStartsAt('')
    setVenue('')
    setCapacity('')
    setServiceError(null)
    onClose()
  }

  const confirmDraft = () => {
    if (!draft || draft.errors.length > 0) return
    const result = onConfirmDraft({ draft, actor: demoUiActor })
    if (!result.ok) {
      setServiceError(`${result.error.message} ${result.error.remediation}`)
      return
    }

    setCreatedEventId(result.data.event.id)
    onDraftChange(null)
    setOrganisationId('')
    setName('')
    setStartsAt('')
    setVenue('')
    setCapacity('')
    setServiceError(null)
  }

  const fieldError = (field: EventDraft['errors'][number]['field']) =>
    draft?.errors.find((issue) => issue.field === field)?.message

  return (
    <section className="event-creation" id="event-creation" aria-labelledby="event-creation-title">
      <div className="event-creation-heading">
        <h2 id="event-creation-title">Create event</h2>
      </div>

      {serviceError ? <p className="event-creation-error" role="alert">{serviceError}</p> : null}

      {draft && draft.errors.length === 0 ? (
        <div className="event-draft-review">
          <h3>Review event</h3>
          <dl>
            <div><dt>Organisation</dt><dd>{formatOrganisationContext(organisationsById.get(draft.organisationId)!)}</dd></div>
            <div><dt>Name</dt><dd>{draft.name}</dd></div>
            <div><dt>Date and time</dt><dd>{formatEventDate(draft.startsAt)}</dd></div>
            <div><dt>Venue</dt><dd>{draft.venue}</dd></div>
            <div><dt>Capacity</dt><dd>{draft.capacity}</dd></div>
          </dl>
          {draft.warnings.map((warning) => (
            <p className="event-draft-warning" key={`${warning.field}-${warning.message}`}>{warning.message}</p>
          ))}
          <div className="event-creation-buttons">
            <button className="button button-primary" type="button" onClick={confirmDraft}>Confirm event</button>
            <button className="button button-secondary" type="button" onClick={cancelDraft}>Cancel draft</button>
          </div>
        </div>
      ) : !createdEventId ? (
        <form className="event-creation-form" noValidate onSubmit={prepareDraft}>
          <div className="event-form-field">
            <label htmlFor="event-organisation">Organisation</label>
            <select
              id="event-organisation"
              aria-invalid={Boolean(fieldError('organisationId'))}
              aria-describedby={fieldError('organisationId') ? 'event-organisation-error' : undefined}
              value={organisationId}
              onChange={(event) => updateField(() => setOrganisationId(event.target.value))}
            >
              <option value="">Select organisation</option>
              {organisations.map((organisation) => (
                <option value={organisation.id} key={organisation.id}>{formatOrganisationContext(organisation)}</option>
              ))}
            </select>
            {fieldError('organisationId') ? (
              <span className="field-error" id="event-organisation-error">{fieldError('organisationId')}</span>
            ) : null}
          </div>
          <div className="event-form-field">
            <label htmlFor="event-name">Event name</label>
            <input
              id="event-name"
              aria-invalid={Boolean(fieldError('name'))}
              aria-describedby={fieldError('name') ? 'event-name-error' : undefined}
              value={name}
              onChange={(event) => updateField(() => setName(event.target.value))}
            />
            {fieldError('name') ? <span className="field-error" id="event-name-error">{fieldError('name')}</span> : null}
          </div>
          <div className="event-form-field">
            <label htmlFor="event-start">Date and time</label>
            <input
              id="event-start"
              type="datetime-local"
              aria-invalid={Boolean(fieldError('startsAt'))}
              aria-describedby={fieldError('startsAt') ? 'event-start-error' : undefined}
              value={startsAt}
              onChange={(event) => updateField(() => setStartsAt(event.target.value))}
            />
            {fieldError('startsAt') ? <span className="field-error" id="event-start-error">{fieldError('startsAt')}</span> : null}
          </div>
          <div className="event-form-field">
            <label htmlFor="event-venue">Venue</label>
            <input
              id="event-venue"
              aria-invalid={Boolean(fieldError('venue'))}
              aria-describedby={fieldError('venue') ? 'event-venue-error' : undefined}
              value={venue}
              onChange={(event) => updateField(() => setVenue(event.target.value))}
            />
            {fieldError('venue') ? <span className="field-error" id="event-venue-error">{fieldError('venue')}</span> : null}
          </div>
          <div className="event-form-field">
            <label htmlFor="event-capacity">Capacity</label>
            <input
              id="event-capacity"
              type="number"
              inputMode="numeric"
              min="1"
              aria-invalid={Boolean(fieldError('capacity'))}
              aria-describedby={fieldError('capacity') ? 'event-capacity-error' : undefined}
              value={capacity}
              onChange={(event) => updateField(() => setCapacity(event.target.value))}
            />
            {fieldError('capacity') ? <span className="field-error" id="event-capacity-error">{fieldError('capacity')}</span> : null}
          </div>
          <button className="button button-primary" type="submit">Review event</button>
        </form>
      ) : null}

      {createdEventId ? (
        <p className="event-created" role="status">Event created.</p>
      ) : null}
    </section>
  )
}

function EventsWorkspace({
  snapshot,
  error,
  isCreatingEvent,
  draft,
  headingRef,
  onCreatingEventChange,
  onDraftChange,
  onOpenEvent,
  onPrepareEventDraft,
  onConfirmEventDraft,
}: {
  snapshot: EventOperationsServiceSnapshot | null
  error: string | null
  isCreatingEvent: boolean
  draft: EventDraft | null
  headingRef: RefObject<HTMLHeadingElement | null>
  onCreatingEventChange: (isCreating: boolean) => void
  onDraftChange: (draft: EventDraft | null) => void
  onOpenEvent: (organisationId: string, eventId: string) => void
  onPrepareEventDraft: EventOperationsService['prepareEventDraft']
  onConfirmEventDraft: EventOperationsService['confirmEventDraft']
}) {
  const [organisationFilterId, setOrganisationFilterId] = useState('all')
  const managedEvents = getManagedEvents(snapshot)
  const visibleManagedEvents = organisationFilterId === 'all'
    ? managedEvents
    : managedEvents.filter((event) => event.organisationId === organisationFilterId)

  return (
    <section className="managed-events-page" aria-labelledby="managed-events-title">
      <div className="section-inner">
        <div className="managed-events-heading">
          <div>
            <h1 id="managed-events-title" ref={headingRef} tabIndex={-1}>Events</h1>
            <span>{visibleManagedEvents.length} {visibleManagedEvents.length === 1 ? 'event' : 'events'}</span>
          </div>
          <div className="managed-events-actions">
            <select
              aria-label="Filter events by organisation"
              value={organisationFilterId}
              onChange={(event) => setOrganisationFilterId(event.target.value)}
            >
              <option value="all">All organisations</option>
              {demoOrganisations.map((organisation) => (
                <option value={organisation.id} key={organisation.id}>{formatOrganisationContext(organisation)}</option>
              ))}
            </select>
            <button
              className={`button ${isCreatingEvent ? 'button-secondary' : 'button-primary'}`}
              type="button"
              aria-expanded={isCreatingEvent}
              aria-controls="event-creation"
              onClick={() => {
                onCreatingEventChange(!isCreatingEvent)
                if (isCreatingEvent) onDraftChange(null)
              }}
            >
              {isCreatingEvent ? 'Close' : 'Create event'}
            </button>
          </div>
        </div>

        {error ? <div className="workspace-error" role="alert">{error}</div> : null}

        {isCreatingEvent ? (
          <EventCreationWorkspace
            organisations={demoOrganisations}
            draft={draft}
            onPrepareDraft={onPrepareEventDraft}
            onConfirmDraft={onConfirmEventDraft}
            onDraftChange={onDraftChange}
            onClose={() => onCreatingEventChange(false)}
          />
        ) : null}

        {visibleManagedEvents.length > 0 ? (
          <ul className="managed-event-list">
            {visibleManagedEvents.map((event) => (
              <li key={event.id}>
                <article className="managed-event-row">
                  <div>
                    <p className="managed-event-organisation">{formatOrganisationContext(organisationsById.get(event.organisationId)!)}</p>
                    <h2>{event.name}</h2>
                    <time dateTime={event.startsAt}>{formatEventDate(event.startsAt)}</time>
                  </div>
                  <div className="managed-event-facts">
                    <span><small>Capacity</small>{event.capacity}</span>
                    <span><small>Status</small>{event.state}</span>
                  </div>
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => onOpenEvent(event.organisationId, event.id)}
                  >
                    Open <Icon name="arrow" />
                  </button>
                </article>
              </li>
            ))}
          </ul>
        ) : null}

      </div>
    </section>
  )
}

function EventOverviewWorkspace({
  event,
  organisation,
  status,
  headingRef,
  onBack,
}: {
  event: Pick<CreatedEvent, 'name' | 'startsAt' | 'venue' | 'capacity'>
  organisation: DemoOrganisation
  status: 'Not started' | 'Published'
  headingRef: RefObject<HTMLHeadingElement | null>
  onBack: () => void
}) {
  return (
    <section className="event-context-page" aria-labelledby="created-event-title">
      <div className="section-inner">
        <button className="breadcrumb" type="button" onClick={onBack}>← Events</button>
        <div className="event-context-heading">
          <div>
            <p className="workspace-context">{formatOrganisationContext(organisation)}</p>
            <h1 id="created-event-title" ref={headingRef} tabIndex={-1}>{event.name}</h1>
          </div>
          <span className="state-badge">{status}</span>
        </div>
        <dl className="event-context-details">
          <div><dt>Date and time</dt><dd>{formatEventDate(event.startsAt)}</dd></div>
          <div><dt>Venue</dt><dd>{event.venue}</dd></div>
          <div><dt>Capacity</dt><dd>{event.capacity}</dd></div>
        </dl>
      </div>
    </section>
  )
}

function EventNotFound({
  headingRef,
  onBack,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  onBack: () => void
}) {
  return (
    <section className="event-not-found" aria-labelledby="event-not-found-title">
      <div className="section-inner">
        <h1 id="event-not-found-title" ref={headingRef} tabIndex={-1}>Event not found</h1>
        <p>This organisation or event is unavailable.</p>
        <button className="button button-primary" type="button" onClick={onBack}>Back to events</button>
      </div>
    </section>
  )
}

function OperationsWorkspace({
  snapshot,
  organisation,
  refreshState,
  error,
  headingRef,
  onBackToEvents,
  onRefresh,
  onListAttendees,
  onSearchAttendees,
  onPrepareAttendeeCheckIn,
  onCheckInAttendee,
}: {
  snapshot: EventOperationsServiceSnapshot | null
  organisation: DemoOrganisation
  refreshState: SnapshotRefreshState
  error: string | null
  headingRef: RefObject<HTMLHeadingElement | null>
  onBackToEvents: () => void
  onRefresh: () => Promise<void>
  onListAttendees: EventOperationsService['listAttendees']
  onSearchAttendees: EventOperationsService['searchAttendees']
  onPrepareAttendeeCheckIn: EventOperationsService['prepareAttendeeCheckIn']
  onCheckInAttendee: EventOperationsService['checkInAttendee']
}) {
  const [attendeeQuery, setAttendeeQuery] = useState('')
  const [expandedAttendeeId, setExpandedAttendeeId] = useState<string | null>(null)
  const [checkInReview, setCheckInReview] = useState<AttendeeCheckInReview | null>(null)
  const [checkInFeedback, setCheckInFeedback] = useState<{ type: 'error' | 'success', message: string } | null>(null)
  const attendeeSearchRef = useRef<HTMLInputElement>(null)
  const trimmedAttendeeQuery = attendeeQuery.trim()
  const attendeeListResult = trimmedAttendeeQuery
    ? onSearchAttendees(trimmedAttendeeQuery)
    : onListAttendees()
  const attendeeResults: readonly AttendeeSearchResult[] = attendeeListResult.ok
    ? attendeeListResult.data
    : []
  const attendeeCountLabel = `${attendeeResults.length} ${trimmedAttendeeQuery
    ? attendeeResults.length === 1 ? 'match' : 'matches'
    : attendeeResults.length === 1 ? 'attendee' : 'attendees'}`
  const anomalies = snapshot?.anomalies ?? []
  const activityTimeline = snapshot?.activityTimeline ?? []

  const updateAttendeeQuery = (query: string) => {
    setAttendeeQuery(query)
    setCheckInReview(null)
    setCheckInFeedback(null)
  }

  const reviewDuplicateRegistrations = (email: string) => {
    updateAttendeeQuery(email)
    attendeeSearchRef.current?.focus()
  }

  const reviewAttendees = () => {
    updateAttendeeQuery('')
    attendeeSearchRef.current?.focus()
  }

  const reviewCheckIn = (attendeeId: string) => {
    const result = onPrepareAttendeeCheckIn({
      query: attendeeQuery,
      attendeeId,
      reason: 'Unrecognised ticket code',
    })

    if (!result.ok) {
      setCheckInReview(null)
      setCheckInFeedback({ type: 'error', message: result.error.message })
      return
    }

    setCheckInReview(result.data)
    setCheckInFeedback(null)
  }

  const confirmCheckIn = () => {
    if (!checkInReview) return
    const result = onCheckInAttendee({
      attendeeId: checkInReview.attendeeId,
      actor: demoUiActor,
      reason: checkInReview.reason,
    })

    if (!result.ok) {
      setCheckInFeedback({ type: 'error', message: result.error.message })
      setCheckInReview(null)
      return
    }

    setCheckInFeedback({ type: 'success', message: `${checkInReview.attendeeName} checked in.` })
    setCheckInReview(null)
  }

  return (
    <section className="operations-workspace" aria-labelledby="operations-title">
      <div className="section-inner">
        <div className="workspace-heading">
          <div>
            <button className="breadcrumb" type="button" onClick={onBackToEvents}>← Events</button>
            <p className="workspace-context">{formatOrganisationContext(organisation)}</p>
            <h1 id="operations-title" ref={headingRef} tabIndex={-1}>{snapshot?.event.name ?? 'Event'}</h1>
          </div>
          {snapshot ? (
            <div className={`snapshot-freshness ${refreshState}`} aria-live="polite">
              <span>{refreshState === 'refreshing' ? 'Refreshing' : refreshState === 'stale' ? 'Stale' : 'Current'}</span>
              {snapshot.lastUpdatedAt ? (
                <span>Updated <time dateTime={snapshot.lastUpdatedAt}>{formatUpdatedTime(snapshot.lastUpdatedAt)}</time></span>
              ) : null}
              <button
                className="button button-secondary button-icon"
                type="button"
                aria-label="Refresh live data"
                title="Refresh live data"
                aria-busy={refreshState === 'refreshing'}
                disabled={refreshState === 'refreshing'}
                onClick={() => void onRefresh()}
              >
                <Icon name="refresh" />
              </button>
            </div>
          ) : null}
        </div>

        {error ? <div className="workspace-error" role="alert">{error}</div> : null}

        {snapshot ? (
          <>
            <dl className="workspace-totals" aria-label="Current event totals">
              <div><dt>Registered</dt><dd>{snapshot.registrationCount}</dd></div>
              <div><dt>Checked in</dt><dd>{snapshot.checkedInCount}</dd></div>
              <div><dt>Not arrived</dt><dd>{snapshot.notArrivedCount}</dd></div>
              <div><dt>Capacity remaining</dt><dd>{snapshot.capacityRemaining}</dd></div>
            </dl>

            <section className="event-anomalies" aria-labelledby="event-anomalies-title">
              <div className="event-anomalies-heading">
                <h2 id="event-anomalies-title">Needs attention</h2>
                <span aria-live="polite">
                  {anomalies.length} {anomalies.length === 1 ? 'issue' : 'issues'}
                </span>
              </div>

              {anomalies.length === 0 ? (
                <p className="event-anomalies-empty">No issues detected.</p>
              ) : (
                <ul className="event-anomaly-list">
                  {anomalies.map((anomaly) => (
                    <li key={anomaly.id}>
                      {anomaly.kind === 'duplicate-registration-candidate' ? (
                        <article className="event-anomaly">
                          <div>
                            <h3>Possible duplicate registrations</h3>
                            <p>{anomaly.reason}</p>
                            <span className="event-anomaly-evidence">{anomaly.matchingEmail}</span>
                            <ul className="duplicate-candidates">
                              {anomaly.candidates.map((candidate) => (
                                <li key={candidate.attendeeId}>
                                  <span>{candidate.attendeeName}</span>
                                  <span>{candidate.registrationReference}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <button
                            className="text-action"
                            type="button"
                            onClick={() => reviewDuplicateRegistrations(anomaly.matchingEmail)}
                          >
                            Review registrations <Icon name="arrow" />
                          </button>
                        </article>
                      ) : (
                        <article className={`event-anomaly ${anomaly.severity}`}>
                          <div>
                            <h3>{anomaly.kind === 'over-capacity' ? 'Over booking capacity' : `${anomaly.remainingPlaces} booking places remaining`}</h3>
                            <p>
                              {anomaly.currentOccupancy} checked in · {anomaly.registeredAttendees} registered · {anomaly.capacity} capacity
                            </p>
                          </div>
                          <button
                            className="text-action"
                            type="button"
                            onClick={reviewAttendees}
                          >
                            Review attendees <Icon name="arrow" />
                          </button>
                        </article>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="attendee-lookup" aria-labelledby="attendee-lookup-title">
              <div className="attendee-lookup-heading">
                <h2 id="attendee-lookup-title">Attendees</h2>
                {attendeeListResult.ok ? (
                  <span aria-live="polite">{attendeeCountLabel}</span>
                ) : null}
              </div>
              <SearchField
                label="Search attendees"
                placeholder="Search attendees"
                value={attendeeQuery}
                onChange={updateAttendeeQuery}
                inputRef={attendeeSearchRef}
              />

              {!attendeeListResult.ok ? (
                <p className="attendee-search-message" role="alert">Attendees could not be loaded. Please try again.</p>
              ) : null}

              {attendeeListResult.ok && attendeeResults.length === 0 ? (
                <p className="attendee-search-message">No attendees found.</p>
              ) : null}

              {checkInFeedback ? (
                <p
                  className={`attendee-search-message check-in-${checkInFeedback.type}`}
                  role={checkInFeedback.type === 'error' ? 'alert' : 'status'}
                >
                  {checkInFeedback.message}
                </p>
              ) : null}

              {attendeeResults.length > 0 ? (
                <ul className="attendee-results">
                  {attendeeResults.map((attendee) => {
                    const isExpanded = expandedAttendeeId === attendee.attendeeId
                    const registrationPanelId = `registration-${attendee.attendeeId}`
                    return (
                      <li key={attendee.attendeeId}>
                        <article className="attendee-result">
                          <div className="attendee-result-summary">
                            <div>
                              <h3>{attendee.name}</h3>
                              <p>Registration {attendee.registrationGroup.reference}</p>
                            </div>
                            <div className="attendee-result-actions">
                              <span className={`check-in-state ${attendee.checkIn.status}`}>
                                {attendee.checkIn.status === 'checked-in' ? 'Checked in' : 'Not arrived'}
                              </span>
                              {attendee.checkIn.status === 'not-arrived' ? (
                                <button
                                  className="button button-primary attendee-check-in-button"
                                  type="button"
                                  aria-label={`Check in ${attendee.name}`}
                                  onClick={() => reviewCheckIn(attendee.attendeeId)}
                                >
                                  Check in
                                </button>
                              ) : null}
                              <button
                                className="button button-secondary button-icon attendee-registration-button"
                                type="button"
                                aria-controls={registrationPanelId}
                                aria-expanded={isExpanded}
                                aria-label={`${isExpanded ? 'Hide' : 'View'} registration for ${attendee.name}`}
                                title={`${isExpanded ? 'Hide' : 'View'} registration`}
                                onClick={() => setExpandedAttendeeId(isExpanded ? null : attendee.attendeeId)}
                              >
                                <Icon name="ticket" />
                              </button>
                            </div>
                          </div>

                          {checkInReview?.attendeeId === attendee.attendeeId ? (
                            <div className="check-in-confirmation" role="group" aria-label={`Confirm check-in for ${attendee.name}`}>
                              <div>
                                <strong>Check in {attendee.name}?</strong>
                                <span>Occupancy {checkInReview.projectedOccupancy} of {checkInReview.capacity}</span>
                              </div>
                              {checkInReview.capacityWarning ? (
                                <p className="check-in-capacity-warning">{checkInReview.capacityWarning}</p>
                              ) : null}
                              <div className="check-in-confirmation-actions">
                                <button className="button button-secondary" type="button" onClick={() => setCheckInReview(null)}>Cancel</button>
                                <button className="button button-primary" type="button" onClick={confirmCheckIn}>Confirm check-in</button>
                              </div>
                            </div>
                          ) : null}

                          {isExpanded ? (
                            <div className="registration-group" id={registrationPanelId}>
                              <h4>Registration {attendee.registrationGroup.reference}</h4>
                              <ul>
                                {attendee.groupMembers.map((member) => (
                                  <li key={member.attendeeId}>
                                    <span>{member.name}</span>
                                    <span className={`check-in-state ${member.checkInStatus}`}>
                                      {member.checkInStatus === 'checked-in' ? 'Checked in' : 'Not arrived'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </article>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </section>

            <div className="workspace-layout">
              <section className="workspace-panel" aria-labelledby="capacity-watch-title">
                <div className="panel-heading">
                  <div>
                    <h2 id="capacity-watch-title">Capacity watch</h2>
                  </div>
                  <span className={`state-badge ${snapshot.capacityStatus}`}>{snapshot.capacityStatus.replace('-', ' ')}</span>
                </div>
                <div className={`capacity-summary ${snapshot.capacityStatus}`}>
                  <strong>{snapshot.capacityRemaining} places remain</strong>
                  <span>{snapshot.checkedInCount} of {snapshot.capacity} checked in</span>
                </div>
              </section>

            </div>

            <details className="activity-timeline">
              <summary>
                <span role="heading" aria-level={2}>Activity</span>
                <span>{activityTimeline.length}</span>
              </summary>
              {activityTimeline.length === 0 ? (
                <p className="activity-empty">No activity yet.</p>
              ) : (
                <ol>
                  {activityTimeline.map((entry) => (
                    <li className={entry.outcome} key={entry.id}>
                      <time dateTime={entry.occurredAt}>{formatActivityTime(entry.occurredAt)}</time>
                      <div className="activity-description">
                        <strong>{getActivityActionLabel(entry.action)}</strong>
                        <span>{entry.targetLabel}</span>
                        <p>{entry.resultSummary}</p>
                      </div>
                      <div className="activity-attribution">
                        <span>
                          {entry.actor.channel === 'webmcp'
                            ? `Site tool · ${entry.toolName ?? entry.actor.displayName}`
                            : `Human · ${entry.actor.displayName}`}
                        </span>
                        <strong>{entry.outcome === 'failed' ? 'Failed' : 'Completed'}</strong>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </>
        ) : null}
      </div>
    </section>
  )
}

function App({ operationsService }: { operationsService?: EventOperationsService }) {
  const [service] = useState(() => operationsService ?? getDemoEventOperationsService())
  const [initialOperationsResult] = useState(() => service.getSnapshot())
  const [initialRoute] = useState(readAppRoute)
  const [webMcpSupported] = useState(hasWebMcpSupport)
  const [surface, setSurface] = useState<AppSurface>(initialRoute.surface)
  const [operationsOrganisationId, setOperationsOrganisationId] = useState<string | null>(initialRoute.organisationId)
  const [operationsEventId, setOperationsEventId] = useState<string | null>(initialRoute.eventId)
  const [operationsSnapshot, setOperationsSnapshot] = useState<EventOperationsServiceSnapshot | null>(
    initialOperationsResult.ok ? initialOperationsResult.data : null,
  )
  const [operationsError, setOperationsError] = useState<string | null>(
    initialOperationsResult.ok ? null : `${initialOperationsResult.error.message} ${initialOperationsResult.error.remediation}`,
  )
  const [operationsAnnouncement, setOperationsAnnouncement] = useState('')
  const [operationsRefreshState, setOperationsRefreshState] = useState<SnapshotRefreshState>(
    initialOperationsResult.ok ? 'fresh' : 'stale',
  )
  const [isCreatingEvent, setIsCreatingEvent] = useState(false)
  const [activeEventDraft, setActiveEventDraft] = useState<EventDraft | null>(null)
  const [selectedOrganisationId, setSelectedOrganisationId] = useState<string | null>(null)
  const [organisationQuery, setOrganisationQuery] = useState('')
  const [organisationFilter, setOrganisationFilter] = useState<OrganisationFilter>('All organisations')
  const [eventQuery, setEventQuery] = useState('')
  const [eventFilter, setEventFilter] = useState<EventFilter>('All events')
  const [selectedEvent, setSelectedEvent] = useState<DemoEvent | null>(null)
  const [bookingStage, setBookingStage] = useState<BookingStage>('event')
  const [ticketCount, setTicketCount] = useState(2)
  const [bookingName, setBookingName] = useState('')
  const [bookingEmail, setBookingEmail] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const operationsHeadingRef = useRef<HTMLHeadingElement>(null)
  const directoryHeadingRef = useRef<HTMLHeadingElement>(null)
  const activeEventDraftRef = useRef(activeEventDraft)

  const selectedOrganisation = demoOrganisations.find((item) => item.id === selectedOrganisationId) ?? null
  const createdEventContext = operationsSnapshot?.createdEvents
    .find((event) => event.id === operationsEventId && event.organisationId === operationsOrganisationId) ?? null
  const publishedEventContext = demoManagedEvents
    .find((event) => event.id === operationsEventId && event.organisationId === operationsOrganisationId) ?? null
  const operationsOrganisation = operationsOrganisationId
    ? organisationsById.get(operationsOrganisationId) ?? null
    : null
  const organisationEvents = useMemo(
    () => selectedOrganisationId ? getOrganisationEvents(selectedOrganisationId) : [],
    [selectedOrganisationId],
  )
  const availableEventCategories = [...new Set(organisationEvents.map((item) => item.category))]

  const visibleOrganisations = useMemo(() => {
    const query = organisationQuery.trim().toLocaleLowerCase('en-GB')
    return demoOrganisations.filter((organisation) => {
      const typeMatches = organisationFilter === 'All organisations' || organisation.type === organisationFilter
      const eventText = getOrganisationEvents(organisation.id).map((item) => `${item.name} ${item.category}`).join(' ')
      const queryMatches = query.length === 0 || [organisation.name, organisation.type, organisation.location, organisation.description, eventText]
        .some((value) => value.toLocaleLowerCase('en-GB').includes(query))
      return typeMatches && queryMatches
    })
  }, [organisationFilter, organisationQuery])

  const visibleEvents = useMemo(() => {
    const query = eventQuery.trim().toLocaleLowerCase('en-GB')
    return organisationEvents.filter((item) => {
      const categoryMatches = eventFilter === 'All events' || item.category === eventFilter
      const queryMatches = query.length === 0 || [item.name, item.summary, item.venue, item.category]
        .some((value) => value.toLocaleLowerCase('en-GB').includes(query))
      return categoryMatches && queryMatches
    })
  }, [eventFilter, eventQuery, organisationEvents])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!selectedEvent || !dialog || dialog.open) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }, [selectedEvent])

  useEffect(() => {
    return service.subscribe((snapshot) => {
      setOperationsSnapshot(snapshot)
      setOperationsError(null)
      setOperationsRefreshState('fresh')
      setOperationsAnnouncement(
        `${snapshot.event.name} updated. ${snapshot.checkedInCount} checked in, ${snapshot.notArrivedCount} not arrived.`,
      )
    })
  }, [service])

  useEffect(() => {
    const applyRoute = () => {
      const route = readAppRoute()
      setSurface(route.surface)
      setOperationsOrganisationId(route.organisationId)
      setOperationsEventId(route.eventId)
      if (route.surface !== 'events' || route.organisationId || route.eventId) {
        activeEventDraftRef.current = null
        setActiveEventDraft(null)
        setIsCreatingEvent(false)
      }
    }
    window.addEventListener('popstate', applyRoute)
    return () => window.removeEventListener('popstate', applyRoute)
  }, [])

  useEffect(() => {
    if (surface === 'events') operationsHeadingRef.current?.focus()
  }, [operationsEventId, operationsOrganisationId, surface])

  const scrollToTop = () => {
    const top = document.getElementById('main-content')
    if (top && typeof top.scrollIntoView === 'function') top.scrollIntoView({ block: 'start' })
  }

  const selectOrganisation = (organisation: DemoOrganisation) => {
    setSelectedOrganisationId(organisation.id)
    setEventQuery('')
    setEventFilter('All events')
    requestAnimationFrame(scrollToTop)
  }

  const showDirectory = () => {
    pushAppPath('/')
    setSurface('directory')
    setOperationsOrganisationId(null)
    setOperationsEventId(null)
    activeEventDraftRef.current = null
    setActiveEventDraft(null)
    setIsCreatingEvent(false)
    setSelectedOrganisationId(null)
    requestAnimationFrame(scrollToTop)
  }

  const showEvents = () => {
    pushAppPath('/events')
    setSelectedEvent(null)
    setSurface('events')
    setOperationsOrganisationId(null)
    setOperationsEventId(null)
    requestAnimationFrame(scrollToTop)
  }

  const openOperationsEvent = (organisationId: string, eventId: string) => {
    pushAppPath(`/organisations/${encodeURIComponent(organisationId)}/events/${encodeURIComponent(eventId)}`)
    setSurface('events')
    setOperationsOrganisationId(organisationId)
    setOperationsEventId(eventId)
    activeEventDraftRef.current = null
    setActiveEventDraft(null)
    setIsCreatingEvent(false)
    requestAnimationFrame(scrollToTop)
  }

  const showHowItWorks = () => {
    pushAppPath('/')
    setSurface('directory')
    setOperationsOrganisationId(null)
    setOperationsEventId(null)
    activeEventDraftRef.current = null
    setActiveEventDraft(null)
    setIsCreatingEvent(false)
    setSelectedOrganisationId(null)
    requestAnimationFrame(() => {
      document.getElementById('how-it-works')?.scrollIntoView({ block: 'start' })
    })
  }

  const refreshOperations = async () => {
    setOperationsRefreshState('refreshing')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const result = service.getSnapshot()
    if (!result.ok) {
      const message = `${result.error.message} ${result.error.remediation}`
      setOperationsError(message)
      setOperationsAnnouncement(message)
      setOperationsRefreshState('stale')
      return
    }

    setOperationsSnapshot(result.data)
    setOperationsError(null)
    setOperationsRefreshState('fresh')
    setOperationsAnnouncement(
      `${result.data.event.name} refreshed. ${result.data.checkedInCount} checked in, ${result.data.notArrivedCount} not arrived.`,
    )
  }

  const requestReset = () => {
    if (!window.confirm('Reset demo?')) return

    const result = service.resetDemo({ actor: demoUiActor })
    if (!result.ok) {
      const message = 'Reset failed. Please try again.'
      setOperationsError(message)
      setOperationsAnnouncement(message)
      window.alert(message)
      return
    }

    setSurface('directory')
    setOperationsOrganisationId(null)
    setOperationsEventId(null)
    pushAppPath('/')
    setSelectedOrganisationId(null)
    setOrganisationQuery('')
    setOrganisationFilter('All organisations')
    setEventQuery('')
    setEventFilter('All events')
    setSelectedEvent(null)
    setBookingStage('event')
    setTicketCount(2)
    setBookingName('')
    setBookingEmail('')
    activeEventDraftRef.current = null
    setActiveEventDraft(null)
    setIsCreatingEvent(false)
    setOperationsSnapshot(result.data)
    setOperationsError(null)
    setOperationsRefreshState('fresh')
    setOperationsAnnouncement('Demo reset.')
    requestAnimationFrame(() => directoryHeadingRef.current?.focus())
  }

  useEffect(() => {
    if (surface !== 'events') return

    const isEventList = operationsOrganisationId === null && operationsEventId === null
    const tools = isEventList
      ? createEventPreparationTools({
          listEvents: () => {
            const snapshot = service.getSnapshot()
            if (!snapshot.ok) return webMcpError(snapshot.error.code, snapshot.error.message)
            const events = getManagedEvents(snapshot.data)
            return webMcpResult(`Found ${events.length} events.`, { ok: true, events })
          },
          createEventDraft: (input) => {
            const result = service.prepareEventDraft(input)
            if (!result.ok) return webMcpError(result.error.code, result.error.message)

            activeEventDraftRef.current = result.data
            setActiveEventDraft(result.data)
            setIsCreatingEvent(true)
            setOperationsAnnouncement(`${result.data.name || 'Event'} draft ready for review.`)
            requestAnimationFrame(() => document.getElementById('event-creation')?.scrollIntoView({ block: 'start' }))
            return webMcpResult(
              `Draft ${result.data.id} is ready for review. No event has been created.`,
              {
                ok: true,
                draft: result.data,
                warnings: result.data.warnings,
                persisted: false,
              },
            )
          },
          confirmEventCreation: (draftId) => {
            const draft = activeEventDraftRef.current
            if (!draft || draft.id !== draftId) {
              return webMcpError('stale_event_draft', 'The matching event draft is no longer active.')
            }

            const organisationName = organisationsById.get(draft.organisationId)?.name ?? 'this organisation'
            if (!window.confirm(`Create “${draft.name}” for ${organisationName}?`)) {
              return webMcpError('confirmation_declined', 'Event creation was not confirmed.')
            }

            const result = service.confirmEventDraft({ draft, actor: demoToolActor })
            if (!result.ok) return webMcpError(result.error.code, result.error.message)

            activeEventDraftRef.current = null
            setActiveEventDraft(null)
            setIsCreatingEvent(false)
            setOperationsAnnouncement(`${result.data.event.name} created.`)
            return webMcpResult(
              `${result.data.event.name} was created.`,
              {
                ok: true,
                event: result.data.event,
                revision: result.data.snapshot.revision,
              },
            )
          },
        }, demoOrganisations.map((organisation) => organisation.id))
      : createEventContextTools(() => {
          const snapshot = service.getSnapshot()
          if (!snapshot.ok) return webMcpError(snapshot.error.code, snapshot.error.message)
          const event = getManagedEvents(snapshot.data).find((item) => (
            item.id === operationsEventId && item.organisationId === operationsOrganisationId
          ))
          if (!event) return webMcpError('stale_event_context', 'The active event is no longer available.')
          return webMcpResult(`${event.name} is the active event.`, {
            ok: true,
            event: {
              eventId: event.id,
              organisationId: event.organisationId,
              organisationName: event.organisationName,
              organisationLocation: event.organisationLocation,
              name: event.name,
              venue: event.venue,
            },
          })
        })

    const registration = registerWebMcpTools(tools)
    void registration.ready.catch(() => undefined)
    return registration.unregister
  }, [operationsEventId, operationsOrganisationId, service, surface])

  const openEvent = (item: DemoEvent) => {
    setSelectedEvent(item)
    setBookingStage('event')
    setTicketCount(2)
    setBookingName('')
    setBookingEmail('')
  }

  const closeEvent = () => {
    const dialog = dialogRef.current
    if (dialog && typeof dialog.close === 'function') dialog.close()
    else {
      dialog?.removeAttribute('open')
      setSelectedEvent(null)
    }
  }

  const submitDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBookingStage('review')
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <header className="site-header">
        <div className="header-inner">
          <button className="attendly-brand" type="button" onClick={showDirectory} aria-label="Attendly-webMCP home">
            <img src="/attendly-logo.png" alt="" />
            <span>Attendly-webMCP</span>
          </button>
          <nav aria-label="Main navigation">
            <button type="button" aria-current={surface === 'directory' ? 'page' : undefined} onClick={showDirectory}>Public events</button>
            <button type="button" aria-current={surface === 'events' ? 'page' : undefined} onClick={showEvents}>Events</button>
          </nav>
          <button className="demo-reset-button" type="button" onClick={requestReset}>Reset demo</button>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{operationsAnnouncement}</p>

      <main id="main-content" tabIndex={-1}>
        {surface === 'events' ? (
          operationsEventId === null && operationsOrganisationId === null ? (
            <EventsWorkspace
              snapshot={operationsSnapshot}
              error={operationsError}
              isCreatingEvent={isCreatingEvent}
              draft={activeEventDraft}
              headingRef={operationsHeadingRef}
              onCreatingEventChange={setIsCreatingEvent}
              onDraftChange={(draft) => {
                activeEventDraftRef.current = draft
                setActiveEventDraft(draft)
              }}
              onOpenEvent={openOperationsEvent}
              onPrepareEventDraft={service.prepareEventDraft}
              onConfirmEventDraft={service.confirmEventDraft}
            />
          ) : operationsOrganisation
            && operationsSnapshot?.event.id === operationsEventId
            && operationsSnapshot.event.organisationId === operationsOrganisationId ? (
            <OperationsWorkspace
              snapshot={operationsSnapshot}
              organisation={operationsOrganisation}
              refreshState={operationsRefreshState}
              error={operationsError}
              headingRef={operationsHeadingRef}
              onBackToEvents={showEvents}
              onRefresh={refreshOperations}
              onListAttendees={service.listAttendees}
              onSearchAttendees={service.searchAttendees}
              onPrepareAttendeeCheckIn={service.prepareAttendeeCheckIn}
              onCheckInAttendee={service.checkInAttendee}
            />
          ) : operationsOrganisation && createdEventContext ? (
            <EventOverviewWorkspace
              event={createdEventContext}
              organisation={operationsOrganisation}
              status="Not started"
              headingRef={operationsHeadingRef}
              onBack={showEvents}
            />
          ) : operationsOrganisation && publishedEventContext ? (
            <EventOverviewWorkspace
              event={publishedEventContext}
              organisation={operationsOrganisation}
              status="Published"
              headingRef={operationsHeadingRef}
              onBack={showEvents}
            />
          ) : (
            <EventNotFound headingRef={operationsHeadingRef} onBack={showEvents} />
          )
        ) : selectedOrganisation ? (
          <>
            <section className="organisation-profile" aria-labelledby="organisation-title">
              <div className="profile-inner">
                <button className="breadcrumb" type="button" onClick={showDirectory}>← All organisations</button>
                <div className="profile-heading">
                  <div className="profile-avatar" aria-hidden="true">{selectedOrganisation.initials}</div>
                  <div>
                    <p>{selectedOrganisation.type} · {selectedOrganisation.location}</p>
                    <h1 id="organisation-title">{selectedOrganisation.name}</h1>
                    <span>{selectedOrganisation.description}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="events-section" id="events" aria-labelledby="events-title">
              <div className="section-inner">
                <div className="results-heading">
                  <div>
                    <h2 id="events-title">Upcoming events</h2>
                    <p>Browse and book events hosted by {selectedOrganisation.name}.</p>
                  </div>
                  <span aria-live="polite">{visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}</span>
                </div>
                <div className="event-tools">
                  <SearchField label="Search this organisation’s events" placeholder="Search this organisation’s events" value={eventQuery} onChange={setEventQuery} />
                  <div className="filter-row" aria-label="Filter events by category">
                    {(['All events', ...availableEventCategories] as EventFilter[]).map((category) => (
                      <button className={eventFilter === category ? 'filter-chip active' : 'filter-chip'} type="button" aria-pressed={eventFilter === category} key={category} onClick={() => setEventFilter(category)}>{category}</button>
                    ))}
                  </div>
                </div>
                <div className="event-list">
                  {visibleEvents.length > 0 ? visibleEvents.map((item) => <EventRow event={item} key={item.id} onSelect={openEvent} />) : (
                    <div className="empty-state">
                      <Icon name="calendar" size={24} />
                      <h3>No events match that search</h3>
                      <p>Try another word or show all event categories.</p>
                      <button className="button button-secondary" type="button" onClick={() => { setEventQuery(''); setEventFilter('All events') }}>Clear filters</button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="directory-hero" aria-labelledby="directory-title">
              <div className="directory-hero-inner">
                <div>
                  <h1 id="directory-title" ref={directoryHeadingRef} tabIndex={-1}>Find events in your community</h1>
                  <p>Browse organisations near you, then see everything they have coming up.</p>
                </div>
                <SearchField label="Search organisations or events" placeholder="Search organisations, places or events" value={organisationQuery} onChange={setOrganisationQuery} />
              </div>
            </section>

            <section className="directory-section" id="organisations" aria-labelledby="organisations-title">
              <div className="section-inner">
                <div className="results-heading">
                  <div>
                    <h2 id="organisations-title">Organisations</h2>
                    <p>Schools, PTAs, churches, venues, charities and clubs using Attendly.</p>
                  </div>
                  <span aria-live="polite">{visibleOrganisations.length} organisations · {demoEvents.length} events</span>
                </div>
                <div className="filter-row organisation-filters" aria-label="Filter organisations by type">
                  {(['All organisations', ...organisationTypes] as OrganisationFilter[]).map((type) => (
                    <button className={organisationFilter === type ? 'filter-chip active' : 'filter-chip'} type="button" aria-pressed={organisationFilter === type} key={type} onClick={() => setOrganisationFilter(type)}>{type}</button>
                  ))}
                </div>
                <div className="organisation-list">
                  {visibleOrganisations.length > 0 ? visibleOrganisations.map((organisation) => <OrganisationRow organisation={organisation} key={organisation.id} onSelect={selectOrganisation} />) : (
                    <div className="empty-state">
                      <Icon name="search" size={24} />
                      <h3>No organisations match that search</h3>
                      <p>Try a place, organisation name or event title.</p>
                      <button className="button button-secondary" type="button" onClick={() => { setOrganisationQuery(''); setOrganisationFilter('All organisations') }}>Clear filters</button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="how-section" id="how-it-works" aria-labelledby="how-title">
              <div className="section-inner how-layout">
                <div><h2 id="how-title">From organisation to event</h2><p>Attendly keeps each organiser’s events together, so it is clear who is hosting and where your booking belongs.</p></div>
                <ol>
                  <li><span>1</span><div><strong>Choose an organisation</strong><p>Find a school, church, PTA, venue or community group.</p></div></li>
                  <li><span>2</span><div><strong>Browse its events</strong><p>See only the events hosted by that organisation.</p></div></li>
                  <li><span>3</span><div><strong>Review and book</strong><p>Check the details before confirming free places.</p></div></li>
                </ol>
              </div>
            </section>
          </>
        )}
      </main>

      <footer>
        <div className="footer-inner">
          <div><img src="/attendly-logo.png" alt="Attendly" /><p>Simple event sign-ups and door check-in for community organisers.</p></div>
          <div className="footer-links"><button type="button" onClick={showDirectory}>Browse organisations</button><button type="button" onClick={showHowItWorks}>How it works</button></div>
        </div>
        {!webMcpSupported ? <p className="webmcp-compatibility">{webMcpCompatibilityGuidance}</p> : null}
      </footer>

      {selectedEvent ? (
        <dialog className="event-dialog" ref={dialogRef} aria-labelledby="dialog-title" onClose={() => setSelectedEvent(null)} onClick={(event) => { if (event.target === event.currentTarget) closeEvent() }}>
          <div className="dialog-panel">
            <div className="dialog-header"><button className="icon-button" type="button" onClick={closeEvent} aria-label="Close event details"><Icon name="close" size={20} /></button></div>
            {bookingStage === 'event' ? (
              <div className="dialog-content">
                <span className="type-label">{selectedEvent.category}</span>
                <div><p className="dialog-owner">Hosted by {selectedOrganisation ? formatOrganisationContext(selectedOrganisation) : ''}</p><h2 id="dialog-title">{selectedEvent.name}</h2></div>
                <p className="dialog-intro">{selectedEvent.description}</p>
                <dl className="detail-list">
                  <div><dt><Icon name="calendar" /> Date</dt><dd>{selectedEvent.dateLabel}</dd></div>
                  <div><dt><Icon name="clock" /> Time</dt><dd>{selectedEvent.timeLabel}</dd></div>
                  <div><dt><Icon name="location" /> Venue</dt><dd>{selectedEvent.venue}</dd></div>
                  <div><dt><Icon name="ticket" /> Tickets</dt><dd>{selectedEvent.availabilityLabel}</dd></div>
                </dl>
                <div className="booking-callout"><div><strong>Free entry</strong><span>{selectedEvent.bookingClosesLabel}</span></div><button className="button button-primary" type="button" onClick={() => setBookingStage('details')}>Book free tickets</button></div>
              </div>
            ) : null}
            {bookingStage === 'details' ? (
              <form className="dialog-content booking-form" onSubmit={submitDetails}>
                <button className="back-button" type="button" onClick={() => setBookingStage('event')}>← Event details</button>
                <div><p className="step-label">Your booking</p><h2 id="dialog-title">Who’s coming?</h2><p className="dialog-intro">Book up to six free places for {selectedEvent.name}.</p></div>
                <label>Number of people<select value={ticketCount} onChange={(event) => setTicketCount(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
                <label>Your name<input required autoComplete="name" value={bookingName} onChange={(event) => setBookingName(event.target.value)} /></label>
                <label>Email address<input required type="email" autoComplete="email" value={bookingEmail} onChange={(event) => setBookingEmail(event.target.value)} /><span>We’ll prepare the booking confirmation for this address.</span></label>
                <button className="button button-primary button-wide" type="submit">Review booking <Icon name="arrow" /></button>
              </form>
            ) : null}
            {bookingStage === 'review' ? (
              <div className="dialog-content">
                <button className="back-button" type="button" onClick={() => setBookingStage('details')}>← Change details</button>
                <div><p className="step-label">Review</p><h2 id="dialog-title">Check your booking</h2><p className="dialog-intro">Nothing is booked until you confirm below.</p></div>
                <dl className="booking-review">
                  <div><dt>Organisation</dt><dd>{selectedOrganisation ? formatOrganisationContext(selectedOrganisation) : ''}</dd></div><div><dt>Event</dt><dd>{selectedEvent.name}</dd></div><div><dt>Date</dt><dd>{selectedEvent.dateLabel}, {selectedEvent.timeLabel}</dd></div><div><dt>Places</dt><dd>{ticketCount}</dd></div><div><dt>Booked by</dt><dd>{bookingName}</dd></div><div><dt>Confirmation</dt><dd>{bookingEmail}</dd></div><div><dt>Total</dt><dd>£0.00</dd></div>
                </dl>
                <button className="button button-primary button-wide" type="button" onClick={() => setBookingStage('confirmed')}>Confirm free booking</button>
              </div>
            ) : null}
            {bookingStage === 'confirmed' ? (
              <div className="dialog-content confirmation">
                <div className="confirmation-icon"><Icon name="check" size={28} /></div>
                <div><p className="step-label">Booking confirmed</p><h2 id="dialog-title">You’re on the list</h2><p className="dialog-intro">{ticketCount} {ticketCount === 1 ? 'place is' : 'places are'} reserved for {selectedEvent.name}. A confirmation has been prepared for {bookingEmail}.</p></div>
                <div className="reference-box"><span>Booking reference</span><strong>ATT-{selectedEvent.id.slice(-4).toUpperCase()}-{ticketCount}</strong></div>
                <button className="button button-primary button-wide" type="button" onClick={closeEvent}>Done</button>
              </div>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </div>
  )
}

export default App
