import { describe, expect, it } from 'vitest'
import { createDemoOperationsSeed } from './seed'

describe('deterministic event-operations seed', () => {
  it('creates the documented Riverside workshop starting state', () => {
    const seed = createDemoOperationsSeed()
    const checkedInAttendeeIds = new Set(seed.checkIns.map((checkIn) => checkIn.attendeeId))

    expect(seed.event).toMatchObject({
      id: 'evt_riverside_community_workshop',
      name: 'Riverside Community Workshop',
      capacity: 20,
      reservedTickets: 16,
      isSynthetic: true,
    })
    expect(seed.attendees).toHaveLength(16)
    expect(seed.checkIns).toHaveLength(13)
    expect(checkedInAttendeeIds.size).toBe(13)

    const sarah = seed.attendees.find((attendee) => attendee.name === 'Sarah Jenkins')
    expect(sarah).toBeDefined()
    expect(checkedInAttendeeIds).not.toContain(sarah?.id)
    expect(seed.attendanceExceptions).toContainEqual(expect.objectContaining({
      kind: 'unrecognised ticket code',
      status: 'unresolved',
      suggestedAttendeeId: sarah?.id,
    }))
  })

  it('includes grouped registration, assistance, capacity, and duplicate-candidate examples', () => {
    const seed = createDemoOperationsSeed()
    const duplicateCandidates = seed.attendees.filter((attendee) => attendee.email === 'sarah.jenkins@example.test')

    expect(seed.registrationGroups.some((group) => group.attendeeIds.length > 1)).toBe(true)
    expect(seed.attendees).toContainEqual(expect.objectContaining({
      assistanceRequirement: 'Step-free access and a seat near the entrance.',
      isSynthetic: true,
    }))
    expect(seed.attendanceAnomalies).toContainEqual(expect.objectContaining({
      kind: 'near capacity',
      registeredAttendees: 16,
      capacity: 20,
      remainingPlaces: 4,
      warningThreshold: 4,
    }))
    expect(duplicateCandidates.map((attendee) => attendee.name)).toEqual(['Sarah Jenkins', 'Priya Shah'])
    expect(new Set(duplicateCandidates.map((attendee) => attendee.registrationGroupId)).size).toBe(2)
  })

  it('uses only explicitly synthetic identities and contact details', () => {
    const seed = createDemoOperationsSeed()

    expect(seed.isSynthetic).toBe(true)
    expect(seed.attendees.every((attendee) => attendee.isSynthetic)).toBe(true)
    expect(seed.attendees.every((attendee) => attendee.email.endsWith('@example.test'))).toBe(true)
    expect(seed.registrationGroups.every((group) => group.isSynthetic)).toBe(true)
    expect(seed.checkIns.every((checkIn) => checkIn.isSynthetic)).toBe(true)
    expect(seed.attendanceExceptions.every((exception) => exception.isSynthetic)).toBe(true)
    expect(seed.attendanceAnomalies.every((anomaly) => anomaly.isSynthetic)).toBe(true)
  })

  it('recreates stable values in fresh objects on every reset', () => {
    const first = createDemoOperationsSeed()
    const second = createDemoOperationsSeed()

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.event).not.toBe(second.event)
    expect(first.attendees).not.toBe(second.attendees)
    expect(first.registrationGroups[0].attendeeIds).not.toBe(second.registrationGroups[0].attendeeIds)
  })
})
