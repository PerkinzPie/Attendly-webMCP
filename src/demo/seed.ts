export type EventCategory = 'Family' | 'Fundraising' | 'Parents & carers'

export type DemoEvent = {
  id: string
  name: string
  summary: string
  description: string
  startsAt: string
  dateLabel: string
  dateShort: {
    day: string
    month: string
  }
  timeLabel: string
  venue: string
  category: EventCategory
  capacity: number
  reservedTickets: number
  availabilityLabel: string
  bookingClosesLabel: string
  featured?: boolean
  isSynthetic: true
}

export const organisation = {
  name: 'Westbrook Primary School',
  location: 'Bristol',
  description:
    'School events, family activities and community fundraisers—all in one place.',
} as const

export const demoEvents: readonly DemoEvent[] = [
  {
    id: 'evt_autumn_fair',
    name: 'Westbrook Autumn Fair',
    summary:
      'An afternoon of games, food, music and activities for the whole family.',
    description:
      'Join families, staff and friends of Westbrook for our annual autumn fair. There will be children’s games, local food stalls, live music and a quiet activity room. Entry is free, but please book so we can plan safely for numbers.',
    startsAt: '2026-09-19T12:00:00+01:00',
    dateLabel: 'Saturday 19 September 2026',
    dateShort: { day: '19', month: 'SEP' },
    timeLabel: '12:00–16:00',
    venue: 'Westbrook Primary School',
    category: 'Family',
    capacity: 180,
    reservedTickets: 136,
    availabilityLabel: '44 places available',
    bookingClosesLabel: 'Bookings close 18 September at 18:00',
    featured: true,
    isSynthetic: true,
  },
  {
    id: 'evt_year_six_quiz',
    name: 'Year 6 Family Quiz Night',
    summary:
      'Teams, table snacks and plenty of not-too-serious questions in aid of the Year 6 residential.',
    description:
      'Bring a team of up to six or join one on the night. The PTA will run five friendly rounds, with a break for refreshments. Children are welcome when accompanied by an adult.',
    startsAt: '2026-10-09T18:30:00+01:00',
    dateLabel: 'Friday 9 October 2026',
    dateShort: { day: '09', month: 'OCT' },
    timeLabel: '18:30–20:30',
    venue: 'Main Hall',
    category: 'Fundraising',
    capacity: 96,
    reservedTickets: 78,
    availabilityLabel: '18 places available',
    bookingClosesLabel: 'Bookings close 8 October at 18:00',
    isSynthetic: true,
  },
  {
    id: 'evt_online_safety',
    name: 'Online Safety for Families',
    summary:
      'A practical evening for parents and carers about helping children navigate life online.',
    description:
      'Our safeguarding lead will share practical guidance on devices, games, social media and family conversations. The session includes time for anonymous questions and signposting to trusted resources.',
    startsAt: '2026-10-21T18:00:00+01:00',
    dateLabel: 'Wednesday 21 October 2026',
    dateShort: { day: '21', month: 'OCT' },
    timeLabel: '18:00–19:15',
    venue: 'Library',
    category: 'Parents & carers',
    capacity: 48,
    reservedTickets: 20,
    availabilityLabel: '28 places available',
    bookingClosesLabel: 'Bookings close 20 October at 18:00',
    isSynthetic: true,
  },
  {
    id: 'evt_lantern_walk',
    name: 'Community Lantern Walk',
    summary:
      'A gentle early-evening walk through the neighbourhood, finishing with hot chocolate.',
    description:
      'Meet in the school playground with your lantern before we set off together on an accessible neighbourhood route. Children must remain with their responsible adult throughout.',
    startsAt: '2026-11-13T17:00:00Z',
    dateLabel: 'Friday 13 November 2026',
    dateShort: { day: '13', month: 'NOV' },
    timeLabel: '17:00–18:30',
    venue: 'School Playground',
    category: 'Family',
    capacity: 120,
    reservedTickets: 112,
    availabilityLabel: '8 places available',
    bookingClosesLabel: 'Bookings close 12 November at 18:00',
    isSynthetic: true,
  },
  {
    id: 'evt_winter_market',
    name: 'Westbrook Winter Market',
    summary:
      'Independent makers, pupil performances and festive food in support of the school library.',
    description:
      'Browse stalls from local makers, hear short performances from school groups and warm up with seasonal food and drink. Free entry helps us manage arrivals and accessibility needs.',
    startsAt: '2026-12-05T11:00:00Z',
    dateLabel: 'Saturday 5 December 2026',
    dateShort: { day: '05', month: 'DEC' },
    timeLabel: '11:00–15:00',
    venue: 'Main Hall & Playground',
    category: 'Fundraising',
    capacity: 220,
    reservedTickets: 154,
    availabilityLabel: '66 places available',
    bookingClosesLabel: 'Bookings close 4 December at 18:00',
    isSynthetic: true,
  },
  {
    id: 'evt_reception_welcome',
    name: 'Reception 2027 Welcome Morning',
    summary:
      'Meet the Reception team, visit the classrooms and ask questions before September.',
    description:
      'A relaxed welcome for families joining Reception in September 2027. You can meet the teaching team, explore the learning spaces and hear what the first few weeks will look like.',
    startsAt: '2027-01-23T10:00:00Z',
    dateLabel: 'Saturday 23 January 2027',
    dateShort: { day: '23', month: 'JAN' },
    timeLabel: '10:00–11:30',
    venue: 'Reception Classrooms',
    category: 'Parents & carers',
    capacity: 64,
    reservedTickets: 18,
    availabilityLabel: '46 places available',
    bookingClosesLabel: 'Bookings close 22 January at 18:00',
    isSynthetic: true,
  },
] as const
