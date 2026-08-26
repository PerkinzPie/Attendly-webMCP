export type DemoEvent = {
  id: string
  name: string
  summary: string
  startsAt: string
  dateLabel: string
  venue: string
  capacity: number
  reservedTickets: number
  availabilityLabel: string
  isSynthetic: true
}

export const demoEvents: readonly DemoEvent[] = [
  {
    id: 'evt_riverside_community_workshop',
    name: 'Riverside Community Workshop',
    summary:
      'A friendly evening workshop used to demonstrate event discovery, booking and organiser workflows.',
    startsAt: '2026-09-18T18:00:00+01:00',
    dateLabel: '18 September 2026, 6:00 pm',
    venue: 'Riverside School Hall',
    capacity: 20,
    reservedTickets: 16,
    availabilityLabel: '4 free places remaining',
    isSynthetic: true,
  },
] as const
