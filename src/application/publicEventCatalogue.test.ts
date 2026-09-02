import { describe, expect, it } from 'vitest'
import { demoEvents, demoOrganisations } from '../demo/seed'
import { createPublicEventCatalogue } from './publicEventCatalogue'

describe('public event catalogue', () => {
  const catalogue = createPublicEventCatalogue(demoEvents, demoOrganisations)

  it('returns published events chronologically inside an inclusive six-month range', () => {
    const result = catalogue.search({
      fromDate: '2026-09-02',
      toDate: '2027-03-02',
      organisationId: 'org_westbrook_school',
    })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.data.events.map((event) => event.eventId)).toEqual([
      'evt_autumn_fair',
      'evt_online_safety',
      'evt_reception_welcome',
    ])
    expect(result.data.events[0]).toMatchObject({
      ticketing: { isFree: true, pricePence: 0, currency: 'GBP' },
      suitability: {
        audiences: expect.arrayContaining(['families', 'children']),
        evidence: 'organiser-authored event metadata',
      },
      availability: { remaining: 44, soldOut: false },
    })
  })

  it('uses only explicit audience and age guidance when filtering suitability', () => {
    const result = catalogue.search({
      fromDate: '2026-09-02',
      toDate: '2027-03-02',
      audience: 'children',
      age: 4,
    })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.data.events.map((event) => event.eventId)).toContain('evt_toddler_music')
    expect(result.data.events.map((event) => event.eventId)).not.toContain('evt_coding_club')
    expect(result.data.events.every((event) => event.suitability.ageGuidance.minAge !== undefined)).toBe(true)
  })

  it('defaults to the next six months from today and matches free-text queries', () => {
    const dated = createPublicEventCatalogue(demoEvents, demoOrganisations, { today: () => '2026-09-02' })

    const upcoming = dated.search({})
    expect(upcoming).toMatchObject({ ok: true, data: { range: { fromDate: '2026-09-02', toDate: '2027-03-02' } } })
    if (!upcoming.ok) return
    expect(upcoming.data.events.length).toBeGreaterThan(0)

    const willowbrook = dated.search({ query: 'willowbrook' })
    expect(willowbrook).toMatchObject({ ok: true })
    if (!willowbrook.ok) return
    expect(willowbrook.data.events.length).toBeGreaterThan(0)
    expect(willowbrook.data.events.every((event) => (
      /willowbrook/i.test(`${event.name} ${event.organisation.name}`)
    ))).toBe(true)

    const none = dated.search({ query: 'no such event anywhere' })
    expect(none).toEqual({
      ok: true,
      data: { range: { fromDate: '2026-09-02', toDate: '2027-03-02' }, events: [] },
    })
  })

  it('rejects an excessive range and returns public details without private records', () => {
    expect(catalogue.search({
      fromDate: '2026-09-02',
      toDate: '2027-03-03',
    })).toEqual({
      ok: false,
      error: {
        code: 'date_range_too_large',
        message: 'Public event searches are limited to six calendar months. Narrow the date range and retry.',
      },
    })

    const details = catalogue.getDetails('evt_autumn_fair')
    expect(details).toMatchObject({
      ok: true,
      data: {
        eventId: 'evt_autumn_fair',
        publicationStatus: 'published',
        bookingRules: {
          freeBookingOnly: true,
          maximumTicketsPerBooking: 6,
          explicitConfirmationRequired: true,
        },
      },
    })
    expect(JSON.stringify(details)).not.toMatch(/attendee|email|check-in/i)
  })
})
