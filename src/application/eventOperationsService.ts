import {
  calculateAttendanceAnomalies,
  checkInAttendee as applyCheckIn,
  confirmEventDraft as applyEventCreation,
  getAccountabilitySnapshot,
  getEventLastUpdatedAt,
  getEventSnapshot,
  listActivityTimeline,
  listAttendees as getAttendees,
  prepareAttendeeCheckIn as buildAttendeeCheckInReview,
  prepareEventDraft as buildEventDraft,
  searchAttendees as findAttendees,
  recordAccountabilityStatus as applyAccountabilityStatus,
  startAccountabilitySession as applyAccountabilityStart,
  type AccountabilitySnapshot,
  type AccountabilityStatus,
  type ActivityEntry,
  type AttendanceAnomaly,
  type AttendeeCheckInReview,
  type AttendeeSearchResult,
  type CreatedEvent,
  type EventDraft,
  type EventDraftInput,
  type EventOperationsState,
  type OperationsActor,
} from '../domain/eventOperations'
import {
  EventOperationsStoreError,
  type EventOperationsStore,
  type PersistedEventOperationsState,
} from './eventOperationsStore'

export type EventOperation =
  | 'create-event'
  | 'check-in-attendee'
  | 'start-accountability'
  | 'record-accountability-status'
  | 'reset-demo'

export type EventOperationsServiceErrorCode =
  | 'not_authorised'
  | 'attendee_not_found'
  | 'attendee_selection_required'
  | 'attendee_already_checked_in'
  | 'accountability_already_active'
  | 'accountability_not_active'
  | 'attendee_not_in_accountability'
  | 'invalid_command'
  | 'invalid_state'
  | 'invalid_event_draft'
  | 'event_draft_already_confirmed'
  | 'persistence_failed'

export type EventOperationsServiceError = {
  readonly code: EventOperationsServiceErrorCode
  readonly message: string
  readonly remediation: string
}

export type EventOperationsServiceResult<T> =
  | { readonly ok: true, readonly data: T }
  | { readonly ok: false, readonly error: EventOperationsServiceError }

export type EventOperationsServiceSnapshot = {
  readonly revision: number
  readonly lastUpdatedAt: string | null
  readonly event: {
    readonly id: string
    readonly organisationId: string
    readonly name: string
    readonly startsAt: string
    readonly capacity: number
  }
  readonly registrationCount: number
  readonly checkedInCount: number
  readonly notArrivedCount: number
  readonly capacity: number
  readonly capacityRemaining: number
  readonly overCapacityBy: number
  readonly capacityStatus: 'available' | 'near-capacity' | 'over-capacity'
  readonly anomalies: readonly AttendanceAnomaly[]
  readonly activityTimeline: readonly ActivityEntry[]
  readonly activeAccountability: AccountabilitySnapshot | null
  readonly createdEvents: readonly CreatedEvent[]
}

export type EventOperationsMutationResult = {
  readonly snapshot: EventOperationsServiceSnapshot
  readonly activityEntry: ActivityEntry
}

export type CreateEventResult = EventOperationsMutationResult & {
  readonly event: CreatedEvent
}

export type CheckInAttendeeRequest = {
  readonly attendeeId: string
  readonly actor: OperationsActor
  readonly reason?: string
}

export type PrepareAttendeeCheckInRequest = {
  readonly query: string
  readonly attendeeId?: string
  readonly reason: string
}

export type StartAccountabilityRequest = {
  readonly actor: OperationsActor
}

export type RecordAccountabilityStatusRequest = {
  readonly attendeeId: string
  readonly status: AccountabilityStatus
  readonly actor: OperationsActor
  readonly note?: string
}

export type ResetDemoRequest = {
  readonly actor: OperationsActor
}

export type ConfirmEventDraftRequest = {
  readonly draft: EventDraft
  readonly actor: OperationsActor
}

export type EventOperationsServiceOptions = {
  readonly store: EventOperationsStore
  readonly authorise: (actor: OperationsActor, operation: EventOperation) => boolean
  readonly now: () => string
  readonly createId: (kind: 'check-in' | 'activity' | 'accountability-session' | 'event' | 'event-draft') => string
  readonly resetState: () => EventOperationsState
  readonly authorisedOrganisationIds: readonly string[]
}

export type EventOperationsService = {
  getSnapshot(): EventOperationsServiceResult<EventOperationsServiceSnapshot>
  listAttendees(): EventOperationsServiceResult<readonly AttendeeSearchResult[]>
  searchAttendees(query: string): EventOperationsServiceResult<readonly AttendeeSearchResult[]>
  prepareAttendeeCheckIn(request: PrepareAttendeeCheckInRequest): EventOperationsServiceResult<AttendeeCheckInReview>
  prepareEventDraft(input: EventDraftInput): EventOperationsServiceResult<EventDraft>
  confirmEventDraft(request: ConfirmEventDraftRequest): EventOperationsServiceResult<CreateEventResult>
  checkInAttendee(request: CheckInAttendeeRequest): EventOperationsServiceResult<EventOperationsMutationResult>
  startAccountability(request: StartAccountabilityRequest): EventOperationsServiceResult<EventOperationsMutationResult>
  recordAccountabilityStatus(
    request: RecordAccountabilityStatusRequest,
  ): EventOperationsServiceResult<EventOperationsMutationResult>
  resetDemo(request: ResetDemoRequest): EventOperationsServiceResult<EventOperationsServiceSnapshot>
  subscribe(listener: (snapshot: EventOperationsServiceSnapshot) => void): () => void
}

class ServiceRejection extends Error {
  readonly detail: EventOperationsServiceError

  constructor(detail: EventOperationsServiceError) {
    super(detail.message)
    this.name = 'ServiceRejection'
    this.detail = detail
  }
}

const errors = {
  notAuthorised: (): EventOperationsServiceError => ({
    code: 'not_authorised',
    message: 'This actor is not authorised to change event operations.',
    remediation: 'Ask an authorised organiser to perform this action.',
  }),
  attendeeNotFound: (): EventOperationsServiceError => ({
    code: 'attendee_not_found',
    message: 'The selected attendee is not registered for this event.',
    remediation: 'Refresh the attendee list and select a registered attendee.',
  }),
  attendeeSelectionRequired: (): EventOperationsServiceError => ({
    code: 'attendee_selection_required',
    message: 'Select a specific attendee before checking in.',
    remediation: 'Choose one attendee from the search results.',
  }),
  attendeeAlreadyCheckedIn: (): EventOperationsServiceError => ({
    code: 'attendee_already_checked_in',
    message: 'The selected attendee is already checked in.',
    remediation: 'Refresh the event snapshot before taking another action.',
  }),
  accountabilityAlreadyActive: (): EventOperationsServiceError => ({
    code: 'accountability_already_active',
    message: 'An accountability session is already active.',
    remediation: 'Continue the active accountability session instead of starting another.',
  }),
  accountabilityNotActive: (): EventOperationsServiceError => ({
    code: 'accountability_not_active',
    message: 'No accountability session is active.',
    remediation: 'Start accountability before recording attendee results.',
  }),
  attendeeNotInAccountability: (): EventOperationsServiceError => ({
    code: 'attendee_not_in_accountability',
    message: 'The selected attendee is not included in the active accountability session.',
    remediation: 'Refresh the accountability list and select an included attendee.',
  }),
  invalidCommand: (): EventOperationsServiceError => ({
    code: 'invalid_command',
    message: 'The requested event operation is not valid.',
    remediation: 'Refresh the event state and review the requested values.',
  }),
  invalidState: (): EventOperationsServiceError => ({
    code: 'invalid_state',
    message: 'The event operation conflicts with the current state.',
    remediation: 'Refresh the event state and retry the operation.',
  }),
  invalidEventDraft: (): EventOperationsServiceError => ({
    code: 'invalid_event_draft',
    message: 'The event draft contains validation errors.',
    remediation: 'Correct the highlighted fields and review the draft again.',
  }),
  eventDraftAlreadyConfirmed: (): EventOperationsServiceError => ({
    code: 'event_draft_already_confirmed',
    message: 'This event draft has already been created.',
    remediation: 'Open the created event or prepare a new draft.',
  }),
  persistenceFailed: (): EventOperationsServiceError => ({
    code: 'persistence_failed',
    message: 'The event operation could not be saved.',
    remediation: 'No changes were saved. Check browser storage and retry.',
  }),
}

function reject(detail: EventOperationsServiceError): never {
  throw new ServiceRejection(detail)
}

function toSnapshot(
  persisted: PersistedEventOperationsState,
  additionalActivityEntries: readonly ActivityEntry[] = [],
): EventOperationsServiceSnapshot {
  const eventSnapshot = getEventSnapshot(persisted.state)
  const anomalies = calculateAttendanceAnomalies(persisted.state)

  return {
    revision: persisted.revision,
    lastUpdatedAt: getEventLastUpdatedAt(persisted.state),
    event: {
      id: persisted.state.event.id,
      organisationId: persisted.state.event.organisationId,
      name: persisted.state.event.name,
      startsAt: persisted.state.event.startsAt,
      capacity: persisted.state.event.capacity,
    },
    registrationCount: eventSnapshot.registeredAttendees,
    checkedInCount: eventSnapshot.occupancy,
    notArrivedCount: eventSnapshot.notArrived,
    capacity: eventSnapshot.capacity,
    capacityRemaining: eventSnapshot.capacityRemaining,
    overCapacityBy: eventSnapshot.overCapacityBy,
    capacityStatus: eventSnapshot.capacityStatus,
    anomalies: anomalies.map((anomaly) => anomaly.kind === 'duplicate-registration-candidate'
      ? { ...anomaly, candidates: anomaly.candidates.map((candidate) => ({ ...candidate })) }
      : { ...anomaly }),
    activityTimeline: listActivityTimeline(persisted.state, additionalActivityEntries)
      .filter((entry) => entry.eventId === persisted.state.event.id),
    activeAccountability: getAccountabilitySnapshot(persisted.state),
    createdEvents: persisted.state.createdEvents.map((event) => ({
      ...event,
      createdBy: { ...event.createdBy },
    })),
  }
}

function failure(error: unknown): EventOperationsServiceResult<never> {
  if (error instanceof ServiceRejection) return { ok: false, error: error.detail }
  if (error instanceof EventOperationsStoreError) return { ok: false, error: errors.persistenceFailed() }
  return { ok: false, error: errors.invalidState() }
}

function requireAuthorised(
  options: EventOperationsServiceOptions,
  actor: OperationsActor,
  operation: EventOperation,
) {
  if (!options.authorise(actor, operation)) reject(errors.notAuthorised())
}

function findAttendee(state: EventOperationsState, attendeeId: string) {
  if (!state.attendees.some((attendee) => attendee.id === attendeeId)) reject(errors.attendeeNotFound())
}

export function createEventOperationsService(
  options: EventOperationsServiceOptions,
): EventOperationsService {
  let failedActivityEntries: ActivityEntry[] = []
  const subscribers = new Set<(snapshot: EventOperationsServiceSnapshot) => void>()

  const publish = (persisted: PersistedEventOperationsState) => {
    const snapshot = toSnapshot(persisted, failedActivityEntries)
    for (const listener of subscribers) listener(snapshot)
  }

  options.store.subscribe(publish)

  const toolName = (actor: OperationsActor, name: string) => actor.channel === 'webmcp' ? name : undefined

  const recordFailedWrite = (error: unknown, entry: Omit<ActivityEntry, 'outcome' | 'isSynthetic'>) => {
    if (!(error instanceof EventOperationsStoreError)) return
    failedActivityEntries = [...failedActivityEntries, {
      ...entry,
      actor: { ...entry.actor },
      outcome: 'failed',
      isSynthetic: true,
    }]
    try {
      publish(options.store.read())
    } catch {
      // The failed attempt remains available if the store becomes readable again.
    }
  }

  function mutationResult(
    persisted: PersistedEventOperationsState,
    activityEntry: ActivityEntry,
  ): EventOperationsServiceResult<EventOperationsMutationResult> {
    return {
      ok: true,
      data: {
        snapshot: toSnapshot(persisted, failedActivityEntries),
        activityEntry,
      },
    }
  }

  return {
    getSnapshot() {
      try {
        return { ok: true, data: toSnapshot(options.store.read(), failedActivityEntries) }
      } catch (error) {
        return failure(error)
      }
    },
    listAttendees() {
      try {
        return { ok: true, data: getAttendees(options.store.read().state) }
      } catch (error) {
        return failure(error)
      }
    },
    searchAttendees(query) {
      try {
        return { ok: true, data: findAttendees(options.store.read().state, query) }
      } catch (error) {
        return failure(error)
      }
    },
    prepareAttendeeCheckIn(request) {
      try {
        const state = options.store.read().state
        const matches = findAttendees(state, request.query)
        if (!request.attendeeId && matches.length > 1) reject(errors.attendeeSelectionRequired())

        const attendeeId = request.attendeeId ?? matches[0]?.attendeeId
        if (!attendeeId) reject(errors.attendeeNotFound())
        findAttendee(state, attendeeId)
        if (state.checkIns.some((checkIn) => checkIn.attendeeId === attendeeId)) {
          reject(errors.attendeeAlreadyCheckedIn())
        }

        return {
          ok: true,
          data: buildAttendeeCheckInReview(state, {
            attendeeId,
            reason: request.reason,
          }),
        }
      } catch (error) {
        return failure(error)
      }
    },
    prepareEventDraft(input) {
      try {
        return {
          ok: true,
          data: buildEventDraft(input, {
            draftId: options.createId('event-draft'),
            preparedAt: options.now(),
            authorisedOrganisationIds: options.authorisedOrganisationIds,
          }),
        }
      } catch (error) {
        return failure(error)
      }
    },
    confirmEventDraft(request) {
      const occurredAt = options.now()
      const eventId = options.createId('event')
      const activityId = options.createId('activity')
      try {
        requireAuthorised(options, request.actor, 'create-event')
        if (
          request.draft.errors.length > 0
          || !options.authorisedOrganisationIds.includes(request.draft.organisationId)
        ) reject(errors.invalidEventDraft())
        const updated = options.store.update((state) => {
          if (state.createdEvents.some((event) => event.sourceDraftId === request.draft.id)) {
            reject(errors.eventDraftAlreadyConfirmed())
          }
          const transition = applyEventCreation(state, request.draft, {
            eventId,
            activityId,
            createdAt: occurredAt,
            actor: request.actor,
            ...(toolName(request.actor, 'confirm_event_creation')
              ? { toolName: 'confirm_event_creation' }
              : {}),
          })
          return {
            state: transition.state,
            value: {
              event: transition.event,
              activityEntry: transition.activityEntry,
            },
          }
        })

        return {
          ok: true,
          data: {
            snapshot: toSnapshot(updated.persisted, failedActivityEntries),
            event: updated.value.event,
            activityEntry: updated.value.activityEntry,
          },
        }
      } catch (error) {
        recordFailedWrite(error, {
          id: activityId,
          eventId,
          action: 'event-created',
          targetId: eventId,
          targetLabel: request.draft.name || 'Event draft',
          actor: request.actor,
          occurredAt,
          resultSummary: 'Event creation was not saved.',
          ...(toolName(request.actor, 'confirm_event_creation') ? { toolName: 'confirm_event_creation' } : {}),
        })
        return failure(error)
      }
    },
    checkInAttendee(request) {
      const occurredAt = options.now()
      const checkInId = options.createId('check-in')
      const activityId = options.createId('activity')
      let targetLabel = request.attendeeId
      let eventId = 'event'
      try {
        requireAuthorised(options, request.actor, 'check-in-attendee')
        const updated = options.store.update((state) => {
          eventId = state.event.id
          findAttendee(state, request.attendeeId)
          targetLabel = state.attendees.find((attendee) => attendee.id === request.attendeeId)?.name ?? targetLabel
          if (state.checkIns.some((checkIn) => checkIn.attendeeId === request.attendeeId)) {
            reject(errors.attendeeAlreadyCheckedIn())
          }

          const transition = applyCheckIn(state, {
            checkInId,
            activityId,
            attendeeId: request.attendeeId,
            checkedInAt: occurredAt,
            actor: request.actor,
            ...(toolName(request.actor, 'check_in_attendee') ? { toolName: 'check_in_attendee' } : {}),
            ...(request.reason ? { reason: request.reason } : {}),
          })
          return { state: transition.state, value: transition.activityEntry }
        })

        return mutationResult(updated.persisted, updated.value)
      } catch (error) {
        recordFailedWrite(error, {
          id: activityId,
          eventId,
          action: 'attendee-checked-in',
          targetId: request.attendeeId,
          targetLabel,
          actor: request.actor,
          occurredAt,
          resultSummary: 'Check-in was not saved.',
          ...(toolName(request.actor, 'check_in_attendee') ? { toolName: 'check_in_attendee' } : {}),
          ...(request.reason ? { note: request.reason } : {}),
        })
        return failure(error)
      }
    },
    startAccountability(request) {
      const occurredAt = options.now()
      const sessionId = options.createId('accountability-session')
      const activityId = options.createId('activity')
      let eventId = 'event'
      try {
        requireAuthorised(options, request.actor, 'start-accountability')
        const updated = options.store.update((state) => {
          eventId = state.event.id
          if (state.accountabilitySession) reject(errors.accountabilityAlreadyActive())

          const transition = applyAccountabilityStart(state, {
            sessionId,
            activityId,
            startedAt: occurredAt,
            actor: request.actor,
            ...(toolName(request.actor, 'start_evacuation_accountability')
              ? { toolName: 'start_evacuation_accountability' }
              : {}),
          })
          return { state: transition.state, value: transition.activityEntry }
        })

        return mutationResult(updated.persisted, updated.value)
      } catch (error) {
        recordFailedWrite(error, {
          id: activityId,
          eventId,
          action: 'accountability-started',
          targetId: sessionId,
          targetLabel: 'Evacuation accountability',
          actor: request.actor,
          occurredAt,
          resultSummary: 'Accountability start was not saved.',
          ...(toolName(request.actor, 'start_evacuation_accountability')
            ? { toolName: 'start_evacuation_accountability' }
            : {}),
        })
        return failure(error)
      }
    },
    recordAccountabilityStatus(request) {
      const occurredAt = options.now()
      const activityId = options.createId('activity')
      let eventId = 'event'
      let targetLabel = request.attendeeId
      try {
        requireAuthorised(options, request.actor, 'record-accountability-status')
        if (!['unconfirmed', 'accounted-for', 'exempt-not-present'].includes(request.status)) {
          reject(errors.invalidCommand())
        }
        const updated = options.store.update((state) => {
          eventId = state.event.id
          targetLabel = state.attendees.find((attendee) => attendee.id === request.attendeeId)?.name ?? targetLabel
          const session = state.accountabilitySession
          if (!session) reject(errors.accountabilityNotActive())
          if (!session.records.some((record) => record.attendeeId === request.attendeeId)) {
            reject(errors.attendeeNotInAccountability())
          }

          const transition = applyAccountabilityStatus(state, {
            attendeeId: request.attendeeId,
            status: request.status,
            activityId,
            recordedAt: occurredAt,
            actor: request.actor,
            ...(toolName(request.actor, 'record_accountability_status')
              ? { toolName: 'record_accountability_status' }
              : {}),
            ...(request.note ? { note: request.note } : {}),
          })
          return { state: transition.state, value: transition.activityEntry }
        })

        return mutationResult(updated.persisted, updated.value)
      } catch (error) {
        recordFailedWrite(error, {
          id: activityId,
          eventId,
          action: 'accountability-status-recorded',
          targetId: request.attendeeId,
          targetLabel,
          actor: request.actor,
          occurredAt,
          resultSummary: 'Accountability update was not saved.',
          ...(toolName(request.actor, 'record_accountability_status')
            ? { toolName: 'record_accountability_status' }
            : {}),
          ...(request.note ? { note: request.note } : {}),
        })
        return failure(error)
      }
    },
    resetDemo(request) {
      const occurredAt = options.now()
      const activityId = options.createId('activity')
      let eventId = 'event'
      const priorFailedActivityEntries = failedActivityEntries
      try {
        requireAuthorised(options, request.actor, 'reset-demo')
        failedActivityEntries = []
        const updated = options.store.update((state) => {
          eventId = state.event.id
          return {
            state: options.resetState(),
            value: null,
          }
        })

        return { ok: true, data: toSnapshot(updated.persisted) }
      } catch (error) {
        failedActivityEntries = priorFailedActivityEntries
        recordFailedWrite(error, {
          id: activityId,
          eventId,
          action: 'demo-reset',
          targetId: 'demo-state',
          targetLabel: 'Demo state',
          actor: request.actor,
          occurredAt,
          resultSummary: 'Reset was not saved.',
          ...(toolName(request.actor, 'reset_demo') ? { toolName: 'reset_demo' } : {}),
        })
        return failure(error)
      }
    },
    subscribe(listener) {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
  }
}
