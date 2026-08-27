import {
  checkInAttendee as applyCheckIn,
  getAccountabilitySnapshot,
  getEventSnapshot,
  searchAttendees as findAttendees,
  recordAccountabilityStatus as applyAccountabilityStatus,
  startAccountabilitySession as applyAccountabilityStart,
  type AccountabilitySnapshot,
  type AccountabilityStatus,
  type ActivityEntry,
  type AttendeeSearchResult,
  type EventOperationsState,
  type OperationsActor,
} from '../domain/eventOperations'
import {
  EventOperationsStoreError,
  type EventOperationsStore,
  type PersistedEventOperationsState,
} from './eventOperationsStore'

export type EventOperation =
  | 'check-in-attendee'
  | 'start-accountability'
  | 'record-accountability-status'
  | 'reset-demo'

export type EventOperationsServiceErrorCode =
  | 'not_authorised'
  | 'attendee_not_found'
  | 'attendee_already_checked_in'
  | 'accountability_already_active'
  | 'accountability_not_active'
  | 'attendee_not_in_accountability'
  | 'invalid_command'
  | 'invalid_state'
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
  readonly event: {
    readonly id: string
    readonly name: string
  }
  readonly registrationCount: number
  readonly checkedInCount: number
  readonly notArrivedCount: number
  readonly capacity: number
  readonly capacityRemaining: number
  readonly overCapacityBy: number
  readonly capacityStatus: 'available' | 'near-capacity' | 'over-capacity'
  readonly activeAccountability: AccountabilitySnapshot | null
}

export type EventOperationsMutationResult = {
  readonly snapshot: EventOperationsServiceSnapshot
  readonly activityEntry: ActivityEntry
}

export type CheckInAttendeeRequest = {
  readonly attendeeId: string
  readonly actor: OperationsActor
  readonly reason?: string
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

export type EventOperationsServiceOptions = {
  readonly store: EventOperationsStore
  readonly authorise: (actor: OperationsActor, operation: EventOperation) => boolean
  readonly now: () => string
  readonly createId: (kind: 'check-in' | 'activity' | 'accountability-session') => string
  readonly resetState: () => EventOperationsState
}

export type EventOperationsService = {
  getSnapshot(): EventOperationsServiceResult<EventOperationsServiceSnapshot>
  searchAttendees(query: string): EventOperationsServiceResult<readonly AttendeeSearchResult[]>
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
  persistenceFailed: (): EventOperationsServiceError => ({
    code: 'persistence_failed',
    message: 'The event operation could not be saved.',
    remediation: 'No changes were saved. Check browser storage and retry.',
  }),
}

function reject(detail: EventOperationsServiceError): never {
  throw new ServiceRejection(detail)
}

function toSnapshot(persisted: PersistedEventOperationsState): EventOperationsServiceSnapshot {
  const eventSnapshot = getEventSnapshot(persisted.state)

  return {
    revision: persisted.revision,
    event: {
      id: persisted.state.event.id,
      name: persisted.state.event.name,
    },
    registrationCount: eventSnapshot.registeredAttendees,
    checkedInCount: eventSnapshot.occupancy,
    notArrivedCount: eventSnapshot.notArrived,
    capacity: eventSnapshot.capacity,
    capacityRemaining: eventSnapshot.capacityRemaining,
    overCapacityBy: eventSnapshot.overCapacityBy,
    capacityStatus: eventSnapshot.capacityStatus,
    activeAccountability: getAccountabilitySnapshot(persisted.state),
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
  function mutationResult(
    persisted: PersistedEventOperationsState,
    activityEntry: ActivityEntry,
  ): EventOperationsServiceResult<EventOperationsMutationResult> {
    return {
      ok: true,
      data: {
        snapshot: toSnapshot(persisted),
        activityEntry,
      },
    }
  }

  return {
    getSnapshot() {
      try {
        return { ok: true, data: toSnapshot(options.store.read()) }
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
    checkInAttendee(request) {
      try {
        requireAuthorised(options, request.actor, 'check-in-attendee')
        const occurredAt = options.now()
        const updated = options.store.update((state) => {
          findAttendee(state, request.attendeeId)
          if (state.checkIns.some((checkIn) => checkIn.attendeeId === request.attendeeId)) {
            reject(errors.attendeeAlreadyCheckedIn())
          }

          const transition = applyCheckIn(state, {
            checkInId: options.createId('check-in'),
            activityId: options.createId('activity'),
            attendeeId: request.attendeeId,
            checkedInAt: occurredAt,
            actor: request.actor,
            ...(request.reason ? { reason: request.reason } : {}),
          })
          return { state: transition.state, value: transition.activityEntry }
        })

        return mutationResult(updated.persisted, updated.value)
      } catch (error) {
        return failure(error)
      }
    },
    startAccountability(request) {
      try {
        requireAuthorised(options, request.actor, 'start-accountability')
        const occurredAt = options.now()
        const updated = options.store.update((state) => {
          if (state.accountabilitySession) reject(errors.accountabilityAlreadyActive())

          const transition = applyAccountabilityStart(state, {
            sessionId: options.createId('accountability-session'),
            activityId: options.createId('activity'),
            startedAt: occurredAt,
            actor: request.actor,
          })
          return { state: transition.state, value: transition.activityEntry }
        })

        return mutationResult(updated.persisted, updated.value)
      } catch (error) {
        return failure(error)
      }
    },
    recordAccountabilityStatus(request) {
      try {
        requireAuthorised(options, request.actor, 'record-accountability-status')
        if (!['unconfirmed', 'accounted-for', 'exempt-not-present'].includes(request.status)) {
          reject(errors.invalidCommand())
        }
        const occurredAt = options.now()
        const updated = options.store.update((state) => {
          const session = state.accountabilitySession
          if (!session) reject(errors.accountabilityNotActive())
          if (!session.records.some((record) => record.attendeeId === request.attendeeId)) {
            reject(errors.attendeeNotInAccountability())
          }

          const transition = applyAccountabilityStatus(state, {
            attendeeId: request.attendeeId,
            status: request.status,
            activityId: options.createId('activity'),
            recordedAt: occurredAt,
            actor: request.actor,
            ...(request.note ? { note: request.note } : {}),
          })
          return { state: transition.state, value: transition.activityEntry }
        })

        return mutationResult(updated.persisted, updated.value)
      } catch (error) {
        return failure(error)
      }
    },
    resetDemo(request) {
      try {
        requireAuthorised(options, request.actor, 'reset-demo')
        const updated = options.store.update(() => ({
          state: options.resetState(),
          value: null,
        }))

        return { ok: true, data: toSnapshot(updated.persisted) }
      } catch (error) {
        return failure(error)
      }
    },
    subscribe(listener) {
      return options.store.subscribe((persisted) => listener(toSnapshot(persisted)))
    },
  }
}
