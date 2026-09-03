import { type FormEvent, type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import './App.css'
import {
  createHttpCreatedEventRepository,
  type CreatedEventRepository,
} from './application/createdEventRepository'
import { getDemoEventOperationsService } from './application/demoEventOperations'
import {
  createPublicBookingService,
  type ConfirmedFreeBooking,
  type FreeBookingDraft,
} from './application/publicBookingService'
import { createPublicEventCatalogue } from './application/publicEventCatalogue'
import type {
  ConfirmEventDraftRequest,
  CreateEventResult,
  EventOperationsService,
  EventOperationsServiceResult,
  EventOperationsServiceSnapshot,
} from './application/eventOperationsService'
import type {
  AccountabilityStatus,
  ActivityEntry,
  AttendanceAnomaly,
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
  getPublishedEventAttendees,
  organisationTypes,
  type DemoEvent,
  type DemoOrganisation,
  type DemoPublishedEventAttendee,
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
  watchWebMcpSupport,
  webMcpCompatibilityGuidance,
  type WebMcpTool,
} from './webmcp/browserAdapter'
import { createEventContextTools } from './webmcp/eventContextTools'
import { createEventReadTools } from './webmcp/eventReadTools'
import { createAttendeeCheckInTool } from './webmcp/attendeeCheckInTool'
import { createAccountabilityTools } from './webmcp/accountabilityTools'
import { createPublicBookingTools } from './webmcp/publicBookingTools'
import { createPublicEventTools } from './webmcp/publicEventTools'

type IconName = 'arrow' | 'calendar' | 'check' | 'chevron' | 'clock' | 'close' | 'location' | 'note' | 'refresh' | 'search' | 'ticket'
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
const browserCreatedEventRepository = createHttpCreatedEventRepository()

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
    chevron: <path d="m6 9 6 6 6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    note: <><path d="M6 3h9l3 3v15H6Z" /><path d="M15 3v4h3M9 11h6M9 15h6" /></>,
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
    timeZone: 'Europe/London',
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
    'accountability-closed': 'Accountability closed',
    'event-created': 'Event created',
    'demo-reset': 'Demo reset',
  }

  return labels[action]
}

function mergeCreatedEvents(...collections: readonly (readonly CreatedEvent[])[]) {
  const eventsByDraftId = new Map<string, CreatedEvent>()
  for (const events of collections) {
    for (const event of events) eventsByDraftId.set(event.sourceDraftId, event)
  }
  return [...eventsByDraftId.values()]
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
}

function getManagedEvents(
  snapshot: EventOperationsServiceSnapshot | null,
  createdEvents: readonly CreatedEvent[] = snapshot?.createdEvents ?? [],
): readonly ManagedEventToolRecord[] {
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
    ...createdEvents.map((event) => ({
      id: event.id,
      organisationId: event.organisationId,
      organisationName: organisationsById.get(event.organisationId)?.name ?? '',
      organisationLocation: organisationsById.get(event.organisationId)?.location ?? '',
      name: event.name,
      startsAt: event.startsAt,
      venue: event.venue,
      capacity: event.capacity,
      state: 'Not started',
    })),
  ].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
}

type ConfirmEventDraftHandler = (
  request: ConfirmEventDraftRequest,
) => EventOperationsServiceResult<CreateEventResult> | Promise<EventOperationsServiceResult<CreateEventResult>>

function webMcpResult<T>(message: string, structuredContent: T) {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent,
  }
}

function webMcpError(code: string, message: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { ok: false, error: { code, message, ...details } },
    isError: true,
  }
}

function toWebMcpAnomaly(anomaly: AttendanceAnomaly) {
  if (anomaly.kind === 'duplicate-registration-candidate') {
    return {
      id: anomaly.id,
      eventId: anomaly.eventId,
      type: anomaly.kind,
      severity: anomaly.severity,
      evidence: {
        reason: anomaly.reason,
        matchingEmail: anomaly.matchingEmail,
      },
      recordIds: {
        attendeeIds: anomaly.candidates.map((candidate) => candidate.attendeeId),
        registrationGroupIds: anomaly.candidates.map((candidate) => candidate.registrationGroupId),
      },
    }
  }

  return {
    id: anomaly.id,
    eventId: anomaly.eventId,
    type: anomaly.kind,
    severity: anomaly.severity,
    evidence: {
      currentOccupancy: anomaly.currentOccupancy,
      registeredAttendees: anomaly.registeredAttendees,
      capacity: anomaly.capacity,
      remainingPlaces: anomaly.remainingPlaces,
      overCapacityBy: anomaly.overCapacityBy,
      warningThreshold: anomaly.warningThreshold,
    },
    recordIds: { eventId: anomaly.eventId },
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
  onConfirmDraft: ConfirmEventDraftHandler
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
  const [isSaving, setIsSaving] = useState(false)

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
    const finish = (result: EventOperationsServiceResult<CreateEventResult>) => {
      setIsSaving(false)
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

    const result = onConfirmDraft({ draft, actor: demoUiActor })
    if (result instanceof Promise) {
      setIsSaving(true)
      void result.then(finish)
      return
    }
    finish(result)
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
            <button className="button button-primary" type="button" disabled={isSaving} onClick={confirmDraft}>
              {isSaving ? 'Saving event…' : 'Confirm event'}
            </button>
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
  createdEvents,
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
  onConfirmEventDraft: ConfirmEventDraftHandler
  createdEvents: readonly CreatedEvent[]
}) {
  const [organisationFilterId, setOrganisationFilterId] = useState('all')
  const managedEvents = getManagedEvents(snapshot, createdEvents)
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
  attendees = [],
  headingRef,
  onBack,
}: {
  event: Pick<CreatedEvent, 'id' | 'name' | 'startsAt' | 'venue' | 'capacity'>
  organisation: DemoOrganisation
  status: 'Not started' | 'Published'
  attendees?: readonly DemoPublishedEventAttendee[]
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
        {attendees.length > 0 ? <PublishedAttendeeList attendees={attendees} /> : null}
      </div>
    </section>
  )
}

function PublishedAttendeeList({ attendees }: { attendees: readonly DemoPublishedEventAttendee[] }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const normalisedQuery = query.trim().toLocaleLowerCase('en-GB')
  const matches = useMemo(() => normalisedQuery
    ? attendees.filter((attendee) => [
        attendee.name,
        attendee.email,
        attendee.registrationReference,
      ].some((value) => value.toLocaleLowerCase('en-GB').includes(normalisedQuery)))
    : attendees, [attendees, normalisedQuery])
  const visibleAttendees = showAll || normalisedQuery ? matches : matches.slice(0, 24)
  const countLabel = normalisedQuery
    ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`
    : `${attendees.length} ${attendees.length === 1 ? 'attendee' : 'attendees'}`

  return (
    <section className="attendee-lookup published-attendee-lookup" aria-labelledby="published-attendee-title">
      <div className="attendee-lookup-heading">
        <div>
          <h2 id="published-attendee-title">Attendees</h2>
          <p>Registration is visible before check-in opens.</p>
        </div>
        <span aria-live="polite">{countLabel}</span>
      </div>
      <SearchField
        label="Search Willowbrook attendees"
        placeholder="Search attendees"
        value={query}
        onChange={(value) => {
          setQuery(value)
          setShowAll(false)
        }}
      />

      {matches.length === 0 ? (
        <p className="attendee-search-message">No attendees found.</p>
      ) : (
        <ul className="attendee-results">
          {visibleAttendees.map((attendee) => (
            <li key={attendee.id}>
              <article className="attendee-result published-attendee-result">
                <div className="attendee-result-summary">
                  <div>
                    <h3>{attendee.name}</h3>
                    <p>Registration {attendee.registrationReference} · {attendee.email}</p>
                  </div>
                  <div className="attendee-result-actions">
                    <span className="check-in-state registered">Registered</span>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {!normalisedQuery && !showAll && matches.length > visibleAttendees.length ? (
        <button className="button button-secondary attendee-show-all" type="button" onClick={() => setShowAll(true)}>
          Show all {matches.length} attendees
        </button>
      ) : null}
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

function AccountabilityWorkspace({
  snapshot,
  attendees,
  onStartAccountability,
  onRecordAccountabilityStatus,
}: {
  snapshot: EventOperationsServiceSnapshot
  attendees: readonly AttendeeSearchResult[]
  onStartAccountability: EventOperationsService['startAccountability']
  onRecordAccountabilityStatus: EventOperationsService['recordAccountabilityStatus']
}) {
  const session = snapshot.accountabilitySession
  const checkedInAttendees = attendees.filter((attendee) => attendee.checkIn.status === 'checked-in')
  const rollCallRecords = session?.records ?? checkedInAttendees.map((attendee) => ({
    attendeeId: attendee.attendeeId,
    attendeeName: attendee.name,
    status: 'unconfirmed' as const,
    note: null,
  }))
  const accountedFor = session?.totals.accountedFor ?? 0
  const expected = session?.totals.total ?? checkedInAttendees.length
  const [isExpanded, setIsExpanded] = useState(false)
  const [noteEditor, setNoteEditor] = useState<{
    attendeeId: string
    note: string
  } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const recordStatus = (attendeeId: string, status: AccountabilityStatus, note?: string | null) => {
    let activeSession = session?.status === 'active' ? session : null
    if (!activeSession) {
      const startResult = onStartAccountability({ actor: demoUiActor })
      if (!startResult.ok) {
        setFeedback(startResult.error.message)
        return false
      }
      activeSession = startResult.data.snapshot.accountabilitySession
    }
    const record = activeSession?.records.find((item) => item.attendeeId === attendeeId)
    if (!record) return
    const result = onRecordAccountabilityStatus({
      attendeeId: record.attendeeId,
      status,
      actor: demoUiActor,
      ...(note?.trim() ? { note: note.trim() } : {}),
    })
    if (!result.ok) {
      setFeedback(result.error.message)
      return false
    }
    setNoteEditor(null)
    setFeedback(null)
    return true
  }

  const saveNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!noteEditor) return
    const record = rollCallRecords.find((item) => item.attendeeId === noteEditor.attendeeId)
    if (!record) return
    recordStatus(record.attendeeId, record.status, noteEditor.note)
  }

  return (
    <section className={`accountability-workspace ${isExpanded ? 'expanded' : ''}`} aria-label="Roll call">
      <h2 className="accountability-heading">
        <button
          type="button"
          aria-controls="roll-call-list"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Hide' : 'Show'} roll call`}
          onClick={() => {
            setIsExpanded(!isExpanded)
            if (isExpanded) setNoteEditor(null)
          }}
        >
          <span className="accountability-title">Roll call</span>
          <span className="accountability-summary"><strong>{accountedFor} of {expected}</strong> accounted for</span>
          <Icon name="chevron" size={18} />
        </button>
      </h2>

      {feedback ? (
        <p className="accountability-feedback" role="alert">{feedback}</p>
      ) : null}

      {isExpanded ? rollCallRecords.length > 0 ? (
        <div id="roll-call-list" className="accountability-content">
          <p className="accountability-instruction">Tick each person at the assembly point.</p>
          <ul className="accountability-list">
            {rollCallRecords.map((record) => {
              const isEditingNote = noteEditor?.attendeeId === record.attendeeId
              const isAccountedFor = record.status === 'accounted-for'
              const nextStatus: AccountabilityStatus = isAccountedFor ? 'unconfirmed' : 'accounted-for'
              const toggleLabel = isAccountedFor
                ? `Mark ${record.attendeeName} unconfirmed`
                : `Mark ${record.attendeeName} accounted for`
              return (
                <li key={record.attendeeId}>
                  <div className="accountability-record">
                    <label className="accountability-check-control" title={toggleLabel}>
                      <input
                        type="checkbox"
                        checked={isAccountedFor}
                        disabled={session?.status === 'closed'}
                        onChange={() => recordStatus(record.attendeeId, nextStatus, record.note)}
                      />
                      <span className="accountability-person">
                        <strong>{record.attendeeName}</strong>
                        {record.note ? <span>{record.note}</span> : null}
                      </span>
                    </label>
                    <div className="accountability-record-actions">
                      {record.status === 'exempt-not-present' ? (
                        <span className="accountability-status exempt-not-present">Not present</span>
                      ) : null}
                      {session?.status !== 'closed' ? (
                        <button
                          className={`icon-button accountability-note-button ${record.note ? 'has-note' : ''}`}
                          type="button"
                          aria-label={`${record.note ? 'Edit' : 'Add'} note for ${record.attendeeName}`}
                          aria-controls={`accountability-note-${record.attendeeId}`}
                          aria-expanded={isEditingNote}
                          title={`${record.note ? 'Edit' : 'Add'} note`}
                          onClick={() => {
                            setNoteEditor(isEditingNote ? null : {
                              attendeeId: record.attendeeId,
                              note: record.note ?? '',
                            })
                            setFeedback(null)
                          }}
                        >
                          <Icon name="note" size={19} />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isEditingNote && noteEditor ? (
                    <form id={`accountability-note-${record.attendeeId}`} className="accountability-note-form" onSubmit={saveNote}>
                      <label>
                        <span className="sr-only">Note for {record.attendeeName}</span>
                        <input
                          aria-label={`Note for ${record.attendeeName}`}
                          placeholder="Add a note"
                          value={noteEditor.note}
                          onChange={(event) => setNoteEditor({ ...noteEditor, note: event.target.value })}
                        />
                      </label>
                      <button className="button button-secondary" type="submit">Save note</button>
                    </form>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p id="roll-call-list" className="accountability-empty">No one is checked in.</p>
      ) : null}
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
  checkInReview,
  onCheckInReviewChange,
  onStartAccountability,
  onRecordAccountabilityStatus,
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
  checkInReview: AttendeeCheckInReview | null
  onCheckInReviewChange: (review: AttendeeCheckInReview | null) => void
  onStartAccountability: EventOperationsService['startAccountability']
  onRecordAccountabilityStatus: EventOperationsService['recordAccountabilityStatus']
}) {
  const [attendeeQuery, setAttendeeQuery] = useState('')
  const [expandedAttendeeId, setExpandedAttendeeId] = useState<string | null>(null)
  const [checkInFeedback, setCheckInFeedback] = useState<{ type: 'error' | 'success', message: string } | null>(null)
  const attendeeSearchRef = useRef<HTMLInputElement>(null)
  const trimmedAttendeeQuery = attendeeQuery.trim()
  const allAttendeeListResult = onListAttendees()
  const attendeeListResult = trimmedAttendeeQuery
    ? onSearchAttendees(trimmedAttendeeQuery)
    : allAttendeeListResult
  const attendeeResults: readonly AttendeeSearchResult[] = attendeeListResult.ok
    ? attendeeListResult.data
    : []
  const allAttendees: readonly AttendeeSearchResult[] = allAttendeeListResult.ok
    ? allAttendeeListResult.data
    : []
  const attendeeCountLabel = `${attendeeResults.length} ${trimmedAttendeeQuery
    ? attendeeResults.length === 1 ? 'match' : 'matches'
    : attendeeResults.length === 1 ? 'attendee' : 'attendees'}`
  const anomalies = snapshot?.anomalies ?? []
  const activityTimeline = snapshot?.activityTimeline ?? []

  const updateAttendeeQuery = (query: string) => {
    setAttendeeQuery(query)
    onCheckInReviewChange(null)
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
      onCheckInReviewChange(null)
      setCheckInFeedback({ type: 'error', message: result.error.message })
      return
    }

    onCheckInReviewChange(result.data)
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
      onCheckInReviewChange(null)
      return
    }

    setCheckInFeedback({ type: 'success', message: `${checkInReview.attendeeName} checked in.` })
    onCheckInReviewChange(null)
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

            <AccountabilityWorkspace
              snapshot={snapshot}
              attendees={allAttendees}
              onStartAccountability={onStartAccountability}
              onRecordAccountabilityStatus={onRecordAccountabilityStatus}
            />

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

              {checkInReview ? (
                <div
                  className="check-in-confirmation"
                  id="attendee-check-in-review"
                  role="group"
                  aria-label={`Confirm check-in for ${checkInReview.attendeeName}`}
                >
                  <div>
                    <strong>Check in {checkInReview.attendeeName}?</strong>
                    <span>Not arrived · Occupancy {checkInReview.currentOccupancy} → {checkInReview.projectedOccupancy} of {checkInReview.capacity}</span>
                  </div>
                  {checkInReview.capacityWarning ? (
                    <p className="check-in-capacity-warning">{checkInReview.capacityWarning}</p>
                  ) : null}
                  <div className="check-in-confirmation-actions">
                    <button className="button button-secondary" type="button" onClick={() => onCheckInReviewChange(null)}>Cancel</button>
                    <button className="button button-primary" type="button" onClick={confirmCheckIn}>Confirm check-in</button>
                  </div>
                </div>
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

function App({ operationsService, createdEventRepository }: {
  operationsService?: EventOperationsService
  createdEventRepository?: CreatedEventRepository
}) {
  const [service] = useState(() => operationsService ?? getDemoEventOperationsService())
  const [eventRepository] = useState(() => (
    createdEventRepository ?? (operationsService ? null : browserCreatedEventRepository)
  ))
  const [publicBookingService] = useState(() => createPublicBookingService({
    events: demoEvents,
    organisations: demoOrganisations,
  }))
  const [publicEventCatalogue] = useState(() => createPublicEventCatalogue(
    demoEvents,
    demoOrganisations,
    { getReservedTickets: publicBookingService.getReservedTickets },
  ))
  const [initialOperationsResult] = useState(() => service.getSnapshot())
  const [initialRoute] = useState(readAppRoute)
  const [webMcpSupported, setWebMcpSupported] = useState(hasWebMcpSupport)
  const [webMcpRegistrationError, setWebMcpRegistrationError] = useState<string | null>(null)
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
  const [persistedCreatedEvents, setPersistedCreatedEvents] = useState<readonly CreatedEvent[]>([])
  const [createdEventStorageError, setCreatedEventStorageError] = useState<string | null>(null)
  const [isCreatingEvent, setIsCreatingEvent] = useState(false)
  const [activeEventDraft, setActiveEventDraft] = useState<EventDraft | null>(null)
  const [activeCheckInReview, setActiveCheckInReview] = useState<AttendeeCheckInReview | null>(null)
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
  const [activeBookingDraft, setActiveBookingDraft] = useState<FreeBookingDraft | null>(null)
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedFreeBooking | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const operationsHeadingRef = useRef<HTMLHeadingElement>(null)
  const directoryHeadingRef = useRef<HTMLHeadingElement>(null)
  const activeEventDraftRef = useRef(activeEventDraft)
  const activeBookingDraftRef = useRef(activeBookingDraft)

  const selectedOrganisation = demoOrganisations.find((item) => item.id === selectedOrganisationId) ?? null
  const allCreatedEvents = useMemo(() => mergeCreatedEvents(
    operationsSnapshot?.createdEvents ?? [],
    persistedCreatedEvents,
  ), [operationsSnapshot?.createdEvents, persistedCreatedEvents])
  const allCreatedEventsRef = useRef(allCreatedEvents)
  const createdEventContext = allCreatedEvents
    .find((event) => event.id === operationsEventId && event.organisationId === operationsOrganisationId) ?? null
  const publishedEventContext = demoManagedEvents
    .find((event) => event.id === operationsEventId && event.organisationId === operationsOrganisationId) ?? null
  const operationsOrganisation = operationsOrganisationId
    ? organisationsById.get(operationsOrganisationId) ?? null
    : null
  const snapshotEventId = operationsSnapshot?.event.id ?? null
  const snapshotOrganisationId = operationsSnapshot?.event.organisationId ?? null
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
    allCreatedEventsRef.current = allCreatedEvents
  }, [allCreatedEvents])

  const refreshPersistedCreatedEvents = useCallback(async () => {
    if (!eventRepository) return
    try {
      const events = await eventRepository.list()
      setPersistedCreatedEvents(events)
      setCreatedEventStorageError(null)
    } catch {
      setCreatedEventStorageError('Shared events could not be loaded. Check your connection and try again.')
    }
  }, [eventRepository])

  useEffect(() => {
    if (!eventRepository) return
    const initialRefresh = requestAnimationFrame(() => void refreshPersistedCreatedEvents())
    const refreshOnFocus = () => void refreshPersistedCreatedEvents()
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      cancelAnimationFrame(initialRefresh)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [eventRepository, refreshPersistedCreatedEvents])

  const confirmEventDraft = useCallback<ConfirmEventDraftHandler>((request) => {
    if (!eventRepository) return service.confirmEventDraft(request)

    return eventRepository.create(request.draft, request.actor.channel).then((persisted) => {
      setPersistedCreatedEvents((current) => mergeCreatedEvents(current, [persisted.event]))
      setCreatedEventStorageError(null)
      return service.confirmEventDraft({
        ...request,
        persistedEvent: {
          id: persisted.event.id,
          createdAt: persisted.event.createdAt,
        },
      })
    }).catch((): EventOperationsServiceResult<CreateEventResult> => ({
      ok: false,
      error: {
        code: 'persistence_failed',
        message: 'The event could not be saved to shared storage.',
        remediation: 'Check your connection and confirm the event again.',
      },
    }))
  }, [eventRepository, service])

  useEffect(() => {
    const applyRoute = () => {
      const route = readAppRoute()
      setSurface(route.surface)
      setOperationsOrganisationId(route.organisationId)
      setOperationsEventId(route.eventId)
      setActiveCheckInReview(null)
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
    setActiveCheckInReview(null)
    activeEventDraftRef.current = null
    setActiveEventDraft(null)
    setIsCreatingEvent(false)
    setSelectedOrganisationId(null)
    requestAnimationFrame(scrollToTop)
  }

  const showEvents = () => {
    void refreshPersistedCreatedEvents()
    pushAppPath('/events')
    setSelectedEvent(null)
    setSurface('events')
    setOperationsOrganisationId(null)
    setOperationsEventId(null)
    setActiveCheckInReview(null)
    requestAnimationFrame(scrollToTop)
  }

  const openOperationsEvent = (organisationId: string, eventId: string) => {
    pushAppPath(`/organisations/${encodeURIComponent(organisationId)}/events/${encodeURIComponent(eventId)}`)
    setSurface('events')
    setOperationsOrganisationId(organisationId)
    setOperationsEventId(eventId)
    setActiveCheckInReview(null)
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
    setActiveCheckInReview(null)
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
    setActiveCheckInReview(null)
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
    activeBookingDraftRef.current = null
    setActiveBookingDraft(null)
    setConfirmedBooking(null)
    setBookingError(null)
    publicBookingService.reset()
    activeEventDraftRef.current = null
    setActiveEventDraft(null)
    setIsCreatingEvent(false)
    setOperationsSnapshot(result.data)
    setOperationsError(null)
    setOperationsRefreshState('fresh')
    setOperationsAnnouncement('Demo reset.')
    requestAnimationFrame(() => directoryHeadingRef.current?.focus())
  }

  const activateWebMcpTools = (tools: readonly WebMcpTool[]) => {
    const registration = registerWebMcpTools(tools)
    if (!registration.supported) return () => undefined
    setWebMcpRegistrationError(null)
    registration.ready.then(
      () => {
        console.info(`WebMCP: registered ${tools.length} site tools for this page.`)
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`WebMCP: site tool registration failed. ${message}`)
        setWebMcpRegistrationError(message)
      },
    )
    return registration.unregister
  }

  useEffect(() => {
    if (webMcpSupported) return
    const watch = watchWebMcpSupport(() => setWebMcpSupported(true))
    return watch.stop
  }, [webMcpSupported])

  useEffect(() => {
    if (surface === 'directory') {
      const scopedEvents = selectedOrganisationId
        ? getOrganisationEvents(selectedOrganisationId)
        : demoEvents
      const scopedEventIds = scopedEvents.map((event) => event.id)
      const tools = [
        ...createPublicEventTools(scopedEventIds, {
          searchPublicEvents: (input) => {
            const result = publicEventCatalogue.search({
              ...input,
              ...(selectedOrganisationId ? { organisationId: selectedOrganisationId } : {}),
            })
            if (!result.ok) return webMcpError(result.error.code, result.error.message)
            const { range, events } = result.data
            return webMcpResult(
              `Found ${events.length} published events between ${range.fromDate} and ${range.toDate}.`,
              {
                ok: true,
                scope: selectedOrganisationId
                  ? { organisationId: selectedOrganisationId }
                  : { organisationId: null },
                range,
                filters: input,
                events,
              },
            )
          },
          getPublicEventDetails: (eventId) => {
            const result = publicEventCatalogue.getDetails(eventId, selectedOrganisationId ?? undefined)
            if (!result.ok) return webMcpError(result.error.code, result.error.message)
            return webMcpResult(`${result.data.name} details read.`, {
              ok: true,
              event: result.data,
            })
          },
        }),
        ...createPublicBookingTools(scopedEventIds, {
          createFreeBookingDraft: async (input) => {
            const event = scopedEvents.find((item) => item.id === input.eventId)
            if (!event) {
              return webMcpError(
                'event_not_found',
                'Use a published event identifier from the current public events page.',
              )
            }
            const result = publicBookingService.createDraft({
              eventId: event.id,
              quantities: {
                adultTickets: input.adultTickets,
                childTickets: input.childTickets,
              },
              guardian: {
                name: input.guardianName,
                email: input.guardianEmail,
              },
            })
            if (!result.ok) {
              return webMcpError(result.error.code, result.error.message, {
                currentAvailability: result.error.currentAvailability,
                requiresNewDraft: result.error.requiresNewDraft,
              })
            }

            const organisation = organisationsById.get(event.organisationId)
            activeBookingDraftRef.current = result.data
            flushSync(() => {
              setSelectedOrganisationId(organisation?.id ?? null)
              setSelectedEvent(event)
              setTicketCount(result.data.quantities.total)
              setBookingName(result.data.guardian.name)
              setBookingEmail(result.data.guardian.email)
              setActiveBookingDraft(result.data)
              setConfirmedBooking(null)
              setBookingError(null)
              setBookingStage('review')
            })
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            const bookingReview = document.getElementById('booking-review')
            if (bookingReview && typeof bookingReview.scrollIntoView === 'function') {
              bookingReview.scrollIntoView({ block: 'nearest' })
            }
            setOperationsAnnouncement(`${event.name} booking draft ready for review.`)
            return webMcpResult(
              `Draft ${result.data.draftId} is visible for review. Nothing has been booked.`,
              { ok: true, draft: result.data },
            )
          },
          confirmFreeBooking: (input) => {
            const draft = activeBookingDraftRef.current
            if (!draft || draft.draftId !== input.draftId) {
              return webMcpError(
                'draft_not_found',
                'The matching booking draft is no longer active. Prepare a new draft for review.',
                { requiresNewDraft: true },
              )
            }

            const result = publicBookingService.confirmDraft(input)
            if (!result.ok) {
              setBookingError(result.error.message)
              if (result.error.requiresNewDraft) {
                activeBookingDraftRef.current = null
                setActiveBookingDraft(null)
                setBookingStage('details')
              }
              return webMcpError(result.error.code, result.error.message, {
                currentAvailability: result.error.currentAvailability,
                requiresNewDraft: result.error.requiresNewDraft,
              })
            }

            flushSync(() => {
              setConfirmedBooking(result.data.booking)
              setBookingError(null)
              setBookingStage('confirmed')
            })
            setOperationsAnnouncement(`${draft.event.name} booking confirmed.`)
            return webMcpResult(
              `Booking ${result.data.booking.bookingReference} confirmed and displayed.`,
              {
                ok: true,
                idempotent: result.data.idempotent,
                booking: result.data.booking,
              },
            )
          },
        }),
      ]
      return activateWebMcpTools(tools)
    }

    const isEventList = operationsOrganisationId === null && operationsEventId === null
    const isEventControlRoom = snapshotEventId === operationsEventId
      && snapshotOrganisationId === operationsOrganisationId
    const readActiveSnapshot = (requestedEventId: string) => {
      if (requestedEventId !== operationsEventId) {
        return {
          ok: false as const,
          result: webMcpError('wrong_event_context', 'The requested event is not active on this page.'),
        }
      }

      const snapshot = service.getSnapshot()
      if (!snapshot.ok) {
        return {
          ok: false as const,
          result: webMcpError(snapshot.error.code, snapshot.error.message),
        }
      }
      if (
        snapshot.data.event.id !== operationsEventId
        || snapshot.data.event.organisationId !== operationsOrganisationId
      ) {
        return {
          ok: false as const,
          result: webMcpError('wrong_event_context', 'The active page does not match the event operations record.'),
        }
      }
      return { ok: true as const, snapshot: snapshot.data }
    }
    const readActiveAccountability = (requestedEventId: string) => {
      const active = readActiveSnapshot(requestedEventId)
      if (!active.ok) return active
      const session = active.snapshot.accountabilitySession
      if (!session || session.status !== 'active') {
        return {
          ok: false as const,
          result: webMcpError('accountability_not_active', 'No accountability session is active.'),
        }
      }
      return { ok: true as const, snapshot: active.snapshot, session }
    }
    const tools = isEventList
      ? createEventPreparationTools({
          listEvents: () => {
            const snapshot = service.getSnapshot()
            if (!snapshot.ok) return webMcpError(snapshot.error.code, snapshot.error.message)
            const events = getManagedEvents(snapshot.data, allCreatedEventsRef.current)
            return webMcpResult(`Found ${events.length} events.`, { ok: true, events })
          },
          createEventDraft: (input) => {
            const result = service.prepareEventDraft(input)
            if (!result.ok) return webMcpError(result.error.code, result.error.message)

            activeEventDraftRef.current = result.data
            setActiveEventDraft(result.data)
            setIsCreatingEvent(true)
            setOperationsAnnouncement(`${result.data.name || 'Event'} draft ready for review.`)
            requestAnimationFrame(() => {
              const workspace = document.getElementById('event-creation')
              if (workspace && typeof workspace.scrollIntoView === 'function') {
                workspace.scrollIntoView({ block: 'start' })
              }
            })
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

            const finish = (result: EventOperationsServiceResult<CreateEventResult>) => {
              if (!result.ok) return webMcpError(result.error.code, result.error.message)

              activeEventDraftRef.current = null
              setActiveEventDraft(null)
              setIsCreatingEvent(false)
              setOperationsAnnouncement(`${result.data.event.name} created.`)
              return webMcpResult(
                `${result.data.event.name} was created and saved to the shared event list.`,
                {
                  ok: true,
                  event: result.data.event,
                  revision: result.data.snapshot.revision,
                  persisted: true,
                },
              )
            }

            const result = confirmEventDraft({ draft, actor: demoToolActor })
            return result instanceof Promise ? result.then(finish) : finish(result)
          },
        }, demoOrganisations.map((organisation) => organisation.id))
      : isEventControlRoom && operationsEventId
        ? [
            ...createEventReadTools(operationsEventId, {
              getEventSnapshot: (eventId) => {
                const active = readActiveSnapshot(eventId)
                if (!active.ok) return active.result
                const snapshot = active.snapshot
                const organisation = organisationsById.get(snapshot.event.organisationId)
                return webMcpResult(`${snapshot.event.name} snapshot read.`, {
                  ok: true,
                  event: {
                    eventId: snapshot.event.id,
                    organisationId: snapshot.event.organisationId,
                    organisationName: organisation?.name ?? '',
                    organisationLocation: organisation?.location ?? '',
                    name: snapshot.event.name,
                    startsAt: snapshot.event.startsAt,
                    venue: snapshot.event.venue,
                  },
                  snapshotAt: snapshot.lastUpdatedAt,
                  revision: snapshot.revision,
                  totals: {
                    registered: snapshot.registrationCount,
                    checkedIn: snapshot.checkedInCount,
                    notArrived: snapshot.notArrivedCount,
                    capacity: snapshot.capacity,
                    capacityRemaining: snapshot.capacityRemaining,
                    overCapacityBy: snapshot.overCapacityBy,
                  },
                  capacityStatus: snapshot.capacityStatus,
                  accountability: snapshot.activeAccountability
                    ? { status: 'active', ...snapshot.activeAccountability }
                    : {
                        status: 'not-active',
                        total: 0,
                        accountedFor: 0,
                        unconfirmed: 0,
                        exemptNotPresent: 0,
                      },
                })
              },
              findAttendee: (eventId, query) => {
                const active = readActiveSnapshot(eventId)
                if (!active.ok) return active.result
                const result = service.searchAttendees(query)
                if (!result.ok) return webMcpError(result.error.code, result.error.message)
                return webMcpResult(`Found ${result.data.length} attendee matches.`, {
                  ok: true,
                  eventId,
                  query: query.trim(),
                  matches: result.data,
                })
              },
              getAttendanceAnomalies: (eventId) => {
                const active = readActiveSnapshot(eventId)
                if (!active.ok) return active.result
                const anomalies = active.snapshot.anomalies.map(toWebMcpAnomaly)
                return webMcpResult(`Found ${anomalies.length} attendance anomalies.`, {
                  ok: true,
                  eventId,
                  anomalies,
                })
              },
            }),
            createAttendeeCheckInTool(operationsEventId, async (input) => {
              const active = readActiveSnapshot(input.eventId)
              if (!active.ok) return active.result
              if (!input.attendeeId) {
                return webMcpError(
                  'attendee_id_required',
                  'Use the stable attendee identifier returned by find_attendee; a name or search query is not sufficient.',
                )
              }

              const attendees = service.listAttendees()
              if (!attendees.ok) return webMcpError(attendees.error.code, attendees.error.message)
              const attendee = attendees.data.find((item) => item.attendeeId === input.attendeeId)
              if (!attendee) {
                return webMcpError(
                  'attendee_not_found',
                  'Use a stable attendee identifier returned by find_attendee for the active event.',
                )
              }

              if (attendee.checkIn.status === 'checked-in') {
                const activity = active.snapshot.activityTimeline.find((entry) => (
                  entry.action === 'attendee-checked-in' && entry.targetId === attendee.attendeeId
                ))
                return webMcpResult(`${attendee.name} is already checked in.`, {
                  ok: true,
                  idempotent: true,
                  eventId: input.eventId,
                  attendee: {
                    attendeeId: attendee.attendeeId,
                    name: attendee.name,
                    registrationReference: attendee.registrationGroup.reference,
                  },
                  previousState: { status: 'checked-in', checkedInAt: attendee.checkIn.checkedInAt },
                  newState: { status: 'checked-in', checkedInAt: attendee.checkIn.checkedInAt },
                  occupancy: {
                    previous: active.snapshot.checkedInCount,
                    current: active.snapshot.checkedInCount,
                    capacity: active.snapshot.capacity,
                  },
                  activityId: activity?.id ?? null,
                  revision: active.snapshot.revision,
                })
              }

              const reason = input.reason.trim()
              if (!reason) return webMcpError('reason_required', 'Provide a reason for the manual check-in.')
              const review = service.prepareAttendeeCheckIn({
                query: '',
                attendeeId: attendee.attendeeId,
                reason,
              })
              if (!review.ok) return webMcpError(review.error.code, review.error.message)


              const result = service.checkInAttendee({
                attendeeId: attendee.attendeeId,
                actor: demoToolActor,
                reason,
              })
              setActiveCheckInReview(null)
              if (!result.ok) return webMcpError(result.error.code, result.error.message)

              setOperationsAnnouncement(`${attendee.name} checked in.`)
              return webMcpResult(`${attendee.name} was checked in.`, {
                ok: true,
                idempotent: false,
                eventId: input.eventId,
                attendee: {
                  attendeeId: attendee.attendeeId,
                  name: attendee.name,
                  registrationReference: attendee.registrationGroup.reference,
                },
                previousState: { status: 'not-arrived', checkedInAt: null },
                newState: { status: 'checked-in', checkedInAt: result.data.activityEntry.occurredAt },
                occupancy: {
                  previous: review.data.currentOccupancy,
                  current: result.data.snapshot.checkedInCount,
                  capacity: result.data.snapshot.capacity,
                },
                activityId: result.data.activityEntry.id,
                revision: result.data.snapshot.revision,
              })
            }),
            ...createAccountabilityTools(operationsEventId, {
              startAccountability: (eventId) => {
                const active = readActiveSnapshot(eventId)
                if (!active.ok) return active.result
                if (active.snapshot.accountabilitySession) {
                  return webMcpError('accountability_already_exists', 'An accountability session already exists for this event.')
                }


                const result = service.startAccountability({ actor: demoToolActor })
                if (!result.ok) return webMcpError(result.error.code, result.error.message)
                const session = result.data.snapshot.accountabilitySession
                if (!session) return webMcpError('invalid_state', 'The accountability session could not be read after it started.')

                setOperationsAnnouncement(`Roll call started for ${session.totals.total} attendees.`)
                return webMcpResult(`Roll call ${session.sessionId} started.`, {
                  ok: true,
                  eventId,
                  sessionId: session.sessionId,
                  expectedAttendees: session.totals.total,
                  startedAt: session.startedAt,
                  actor: {
                    id: result.data.activityEntry.actor.id,
                    displayName: result.data.activityEntry.actor.displayName,
                    channel: result.data.activityEntry.actor.channel,
                  },
                  activityId: result.data.activityEntry.id,
                  revision: result.data.snapshot.revision,
                })
              },
              getUnconfirmedAttendees: (eventId) => {
                const active = readActiveAccountability(eventId)
                if (!active.ok) return active.result
                const unconfirmed = active.session.records.filter((record) => record.status === 'unconfirmed')
                return webMcpResult(`${unconfirmed.length} attendees remain unconfirmed.`, {
                  ok: true,
                  eventId,
                  sessionId: active.session.sessionId,
                  snapshotAt: active.session.updatedAt,
                  totals: active.session.totals,
                  attendees: unconfirmed.map((record) => ({
                    attendeeId: record.attendeeId,
                    name: record.attendeeName,
                    status: 'unconfirmed',
                    note: record.note,
                  })),
                })
              },
              recordAccountabilityStatus: (input) => {
                const active = readActiveAccountability(input.eventId)
                if (!active.ok) return active.result
                if (input.status !== 'accounted_for') {
                  return webMcpError('invalid_status', 'This tool can only record accounted_for.')
                }
                const record = active.session.records.find((item) => item.attendeeId === input.attendeeId)
                if (!record) {
                  return webMcpError('attendee_not_in_accountability', 'Use an attendee identifier returned by get_unconfirmed_attendees.')
                }
                if (record.status !== 'unconfirmed') {
                  return webMcpError('attendee_not_unconfirmed', `${record.attendeeName} is not currently unconfirmed.`)
                }

                const note = input.note.trim()
                const result = service.recordAccountabilityStatus({
                  attendeeId: record.attendeeId,
                  status: 'accounted-for',
                  actor: demoToolActor,
                  ...(note ? { note } : {}),
                })
                if (!result.ok) return webMcpError(result.error.code, result.error.message)

                setOperationsAnnouncement(`${record.attendeeName} accounted for.`)
                return webMcpResult(`${record.attendeeName} was recorded as accounted for.`, {
                  ok: true,
                  eventId: input.eventId,
                  sessionId: active.session.sessionId,
                  attendee: {
                    attendeeId: record.attendeeId,
                    name: record.attendeeName,
                  },
                  previousState: { status: 'unconfirmed' },
                  newState: { status: 'accounted_for', note: note || null },
                  actor: {
                    id: result.data.activityEntry.actor.id,
                    displayName: result.data.activityEntry.actor.displayName,
                    channel: result.data.activityEntry.actor.channel,
                  },
                  recordedAt: result.data.activityEntry.occurredAt,
                  activityId: result.data.activityEntry.id,
                  totals: result.data.snapshot.accountabilitySession?.totals ?? null,
                  revision: result.data.snapshot.revision,
                })
              },
              generateIncidentSummary: (eventId) => {
                const active = readActiveSnapshot(eventId)
                if (!active.ok) return active.result
                const session = active.snapshot.accountabilitySession
                if (!session) return webMcpError('accountability_not_started', 'No accountability session exists for this event.')
                const unresolvedAttendees = session.records.filter((record) => record.status === 'unconfirmed')
                const recordedAttendees = session.records.filter((record) => record.hasRecordedStatus)
                const missingStatuses = unresolvedAttendees.filter((record) => !record.hasRecordedStatus)

                return webMcpResult(`Incident summary generated for roll call ${session.sessionId}.`, {
                  ok: true,
                  eventId,
                  sessionId: session.sessionId,
                  snapshotAt: session.updatedAt,
                  recordedFacts: {
                    session: {
                      status: session.status,
                      startedAt: session.startedAt,
                      closedAt: session.closedAt,
                    },
                    totals: session.totals,
                    attendeeStatuses: recordedAttendees.map((record) => ({
                      attendeeId: record.attendeeId,
                      name: record.attendeeName,
                      status: record.status === 'accounted-for' ? 'accounted_for' : record.status,
                      recordedAt: record.updatedAt,
                      note: record.note,
                    })),
                    unresolvedAttendees: unresolvedAttendees.map((record) => ({
                      attendeeId: record.attendeeId,
                      name: record.attendeeName,
                    })),
                  },
                  missingInformation: {
                    attendeeStatuses: missingStatuses.map((record) => ({
                      attendeeId: record.attendeeId,
                      name: record.attendeeName,
                    })),
                  },
                  limitations: {
                    physicalSafetyInferred: false,
                  },
                })
              },
              closeAccountability: (eventId) => {
                const active = readActiveAccountability(eventId)
                if (!active.ok) return active.result

                const result = service.closeAccountability({ actor: demoToolActor })
                if (!result.ok) return webMcpError(result.error.code, result.error.message)
                const session = result.data.snapshot.accountabilitySession
                if (!session) return webMcpError('invalid_state', 'The closed accountability session could not be read.')

                setOperationsAnnouncement(`Roll call closed with ${session.totals.unconfirmed} unconfirmed.`)
                return webMcpResult(`Roll call ${session.sessionId} closed.`, {
                  ok: true,
                  eventId,
                  sessionId: session.sessionId,
                  unresolvedAttendees: session.totals.unconfirmed,
                  closedAt: session.closedAt,
                  actor: session.closedBy ? {
                    id: session.closedBy.id,
                    displayName: session.closedBy.displayName,
                    channel: session.closedBy.channel,
                  } : null,
                  activityId: result.data.activityEntry.id,
                  revision: result.data.snapshot.revision,
                })
              },
            }),
          ]
        : createEventContextTools(() => {
          const snapshot = service.getSnapshot()
          if (!snapshot.ok) return webMcpError(snapshot.error.code, snapshot.error.message)
          const event = getManagedEvents(snapshot.data, allCreatedEventsRef.current).find((item) => (
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

    return activateWebMcpTools(tools)
  }, [
    confirmEventDraft,
    operationsEventId,
    operationsOrganisationId,
    publicEventCatalogue,
    publicBookingService,
    selectedOrganisationId,
    service,
    snapshotEventId,
    snapshotOrganisationId,
    surface,
    webMcpSupported,
  ])

  const openEvent = (item: DemoEvent) => {
    setSelectedEvent(item)
    setBookingStage('event')
    setTicketCount(2)
    setBookingName('')
    setBookingEmail('')
    activeBookingDraftRef.current = null
    setActiveBookingDraft(null)
    setConfirmedBooking(null)
    setBookingError(null)
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
    if (!selectedEvent) return
    const result = publicBookingService.createDraft({
      eventId: selectedEvent.id,
      quantities: { adultTickets: ticketCount, childTickets: 0 },
      guardian: { name: bookingName, email: bookingEmail },
    })
    if (!result.ok) {
      setBookingError(result.error.message)
      return
    }
    activeBookingDraftRef.current = result.data
    setActiveBookingDraft(result.data)
    setConfirmedBooking(null)
    setBookingError(null)
    setBookingStage('review')
  }

  const confirmVisibleBooking = () => {
    const draft = activeBookingDraftRef.current
    if (!draft) {
      setBookingError('This booking draft is no longer active. Prepare a new draft for review.')
      setBookingStage('details')
      return
    }

    const result = publicBookingService.confirmDraft({
      draftId: draft.draftId,
      idempotencyKey: `human-${draft.draftId}`,
    })
    if (!result.ok) {
      setBookingError(result.error.message)
      if (result.error.requiresNewDraft) {
        activeBookingDraftRef.current = null
        setActiveBookingDraft(null)
        setBookingStage('details')
      }
      return
    }
    setConfirmedBooking(result.data.booking)
    setBookingError(null)
    setBookingStage('confirmed')
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
              error={operationsError ?? createdEventStorageError}
              isCreatingEvent={isCreatingEvent}
              draft={activeEventDraft}
              createdEvents={allCreatedEvents}
              headingRef={operationsHeadingRef}
              onCreatingEventChange={setIsCreatingEvent}
              onDraftChange={(draft) => {
                activeEventDraftRef.current = draft
                setActiveEventDraft(draft)
              }}
              onOpenEvent={openOperationsEvent}
              onPrepareEventDraft={service.prepareEventDraft}
              onConfirmEventDraft={confirmEventDraft}
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
              checkInReview={activeCheckInReview}
              onCheckInReviewChange={setActiveCheckInReview}
              onStartAccountability={service.startAccountability}
              onRecordAccountabilityStatus={service.recordAccountabilityStatus}
            />
          ) : operationsOrganisation && createdEventContext ? (
            <EventOverviewWorkspace
              key={createdEventContext.id}
              event={createdEventContext}
              organisation={operationsOrganisation}
              status="Not started"
              headingRef={operationsHeadingRef}
              onBack={showEvents}
            />
          ) : operationsOrganisation && publishedEventContext ? (
            <EventOverviewWorkspace
              key={publishedEventContext.id}
              event={publishedEventContext}
              organisation={operationsOrganisation}
              status="Published"
              attendees={getPublishedEventAttendees(publishedEventContext.id)}
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
        {webMcpRegistrationError ? <p className="webmcp-compatibility">Site tools could not be registered: {webMcpRegistrationError}</p> : null}
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
                {bookingError ? <p className="field-error" role="alert">{bookingError}</p> : null}
                <label>Number of people<select value={ticketCount} onChange={(event) => setTicketCount(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
                <label>Your name<input required autoComplete="name" value={bookingName} onChange={(event) => setBookingName(event.target.value)} /></label>
                <label>Email address<input required type="email" autoComplete="email" value={bookingEmail} onChange={(event) => setBookingEmail(event.target.value)} /><span>We’ll prepare the booking confirmation for this address.</span></label>
                <button className="button button-primary button-wide" type="submit">Review booking <Icon name="arrow" /></button>
              </form>
            ) : null}
            {bookingStage === 'review' && activeBookingDraft ? (
              <div className="dialog-content" id="booking-review">
                <button className="back-button" type="button" onClick={() => setBookingStage('details')}>← Change details</button>
                <div><p className="step-label">Review</p><h2 id="dialog-title">Check your booking</h2><p className="dialog-intro">Nothing is booked until you confirm below.</p></div>
                {bookingError ? <p className="field-error" role="alert">{bookingError}</p> : null}
                <dl className="booking-review">
                  <div><dt>Organisation</dt><dd>{selectedOrganisation ? formatOrganisationContext(selectedOrganisation) : ''}</dd></div><div><dt>Event</dt><dd>{selectedEvent.name}</dd></div><div><dt>Date</dt><dd>{selectedEvent.dateLabel}, {selectedEvent.timeLabel}</dd></div><div><dt>Places</dt><dd>{activeBookingDraft.quantities.total}</dd></div><div><dt>Adult tickets</dt><dd>{activeBookingDraft.quantities.adultTickets}</dd></div><div><dt>Child tickets</dt><dd>{activeBookingDraft.quantities.childTickets}</dd></div><div><dt>Booked by</dt><dd>{activeBookingDraft.guardian.name}</dd></div><div><dt>Confirmation</dt><dd>{activeBookingDraft.guardian.email}</dd></div><div><dt>Total</dt><dd>{activeBookingDraft.price.display}</dd></div>
                </dl>
                <p className="dialog-intro">This draft expires at {formatUpdatedTime(activeBookingDraft.expiresAt)}. Current availability: {activeBookingDraft.availability.remaining} places.</p>
                <button className="button button-primary button-wide" type="button" onClick={confirmVisibleBooking}>Confirm free booking</button>
              </div>
            ) : null}
            {bookingStage === 'confirmed' && confirmedBooking ? (
              <div className="dialog-content confirmation">
                <div className="confirmation-icon"><Icon name="check" size={28} /></div>
                <div><p className="step-label">Booking confirmed</p><h2 id="dialog-title">You’re on the list</h2><p className="dialog-intro">{confirmedBooking.quantities.total} {confirmedBooking.quantities.total === 1 ? 'place is' : 'places are'} reserved for {selectedEvent.name}. A confirmation has been prepared for {confirmedBooking.guardian.email}.</p></div>
                <div className="reference-box"><span>Booking reference</span><strong>{confirmedBooking.bookingReference}</strong></div>
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
