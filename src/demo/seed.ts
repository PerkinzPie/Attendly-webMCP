export type OrganisationType =
  | 'Charity'
  | 'Church'
  | 'Function room'
  | 'PTA'
  | 'School'
  | 'Sports club'

export type EventCategory =
  | 'Community'
  | 'Family'
  | 'Fundraising'
  | 'Parents & carers'
  | 'Performance'
  | 'Workshop'

export type DemoOrganisation = {
  id: string
  name: string
  type: OrganisationType
  location: string
  initials: string
  description: string
  isSynthetic: true
}

export type DemoEvent = {
  id: string
  organisationId: string
  name: string
  summary: string
  description: string
  startsAt: string
  dateLabel: string
  dateShort: { day: string; month: string }
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

export const organisationTypes: readonly OrganisationType[] = [
  'School',
  'PTA',
  'Church',
  'Function room',
  'Charity',
  'Sports club',
]

export const demoOrganisations: readonly DemoOrganisation[] = [
  {
    id: 'org_westbrook_school',
    name: 'Westbrook Primary School',
    type: 'School',
    location: 'Bristol',
    initials: 'WP',
    description: 'School events, family activities and community gatherings for Westbrook families.',
    isSynthetic: true,
  },
  {
    id: 'org_westbrook_pta',
    name: 'Friends of Westbrook PTA',
    type: 'PTA',
    location: 'Bristol',
    initials: 'FW',
    description: 'Fundraisers and social events supporting pupils and families at Westbrook.',
    isSynthetic: true,
  },
  {
    id: 'org_st_lukes',
    name: 'St Luke’s Community Church',
    type: 'Church',
    location: 'Bath',
    initials: 'SL',
    description: 'Open community meals, family groups, music and neighbourhood support events.',
    isSynthetic: true,
  },
  {
    id: 'org_lantern_rooms',
    name: 'The Lantern Rooms',
    type: 'Function room',
    location: 'Bristol',
    initials: 'LR',
    description: 'A neighbourhood venue hosting workshops, celebrations and independent performances.',
    isSynthetic: true,
  },
  {
    id: 'org_harbour_youth',
    name: 'Harbour Youth Project',
    type: 'Charity',
    location: 'Portishead',
    initials: 'HY',
    description: 'Creative, practical and social opportunities for young people and their families.',
    isSynthetic: true,
  },
  {
    id: 'org_redland_sports',
    name: 'Redland Community Sports Club',
    type: 'Sports club',
    location: 'Bristol',
    initials: 'RC',
    description: 'Inclusive sports sessions, club socials and volunteer-led community activities.',
    isSynthetic: true,
  },
] as const

const event = (input: Omit<DemoEvent, 'availabilityLabel' | 'isSynthetic'>): DemoEvent => ({
  ...input,
  availabilityLabel: `${input.capacity - input.reservedTickets} places available`,
  isSynthetic: true,
})

export const demoEvents: readonly DemoEvent[] = [
  event({
    id: 'evt_autumn_fair', organisationId: 'org_westbrook_school', name: 'Westbrook Autumn Fair',
    summary: 'An afternoon of games, food, music and activities for the whole family.',
    description: 'Join families, staff and friends for children’s games, local food stalls, live music and a quiet activity room. Entry is free, but please book so the school can plan safely for numbers.',
    startsAt: '2026-09-19T12:00:00+01:00', dateLabel: 'Saturday 19 September 2026',
    dateShort: { day: '19', month: 'SEP' }, timeLabel: '12:00–16:00', venue: 'School Hall & Playground',
    category: 'Family', capacity: 180, reservedTickets: 136, bookingClosesLabel: 'Bookings close 18 September at 18:00', featured: true,
  }),
  event({
    id: 'evt_online_safety', organisationId: 'org_westbrook_school', name: 'Online Safety for Families',
    summary: 'A practical evening about helping children navigate life online.',
    description: 'The safeguarding lead will share practical guidance on devices, games and social media, with time for anonymous questions.',
    startsAt: '2026-10-21T18:00:00+01:00', dateLabel: 'Wednesday 21 October 2026',
    dateShort: { day: '21', month: 'OCT' }, timeLabel: '18:00–19:15', venue: 'School Library',
    category: 'Parents & carers', capacity: 48, reservedTickets: 20, bookingClosesLabel: 'Bookings close 20 October at 18:00',
  }),
  event({
    id: 'evt_reception_welcome', organisationId: 'org_westbrook_school', name: 'Reception 2027 Welcome Morning',
    summary: 'Meet the Reception team, visit the classrooms and ask questions before September.',
    description: 'A relaxed welcome for families joining Reception in September 2027, with time to explore the learning spaces.',
    startsAt: '2027-01-23T10:00:00Z', dateLabel: 'Saturday 23 January 2027',
    dateShort: { day: '23', month: 'JAN' }, timeLabel: '10:00–11:30', venue: 'Reception Classrooms',
    category: 'Parents & carers', capacity: 64, reservedTickets: 18, bookingClosesLabel: 'Bookings close 22 January at 18:00',
  }),
  event({
    id: 'evt_quiz_night', organisationId: 'org_westbrook_pta', name: 'Year 6 Family Quiz Night',
    summary: 'Teams, table snacks and friendly questions in aid of the Year 6 residential.',
    description: 'Bring a team of up to six or join one on the night. Children are welcome when accompanied by an adult.',
    startsAt: '2026-10-09T18:30:00+01:00', dateLabel: 'Friday 9 October 2026',
    dateShort: { day: '09', month: 'OCT' }, timeLabel: '18:30–20:30', venue: 'Westbrook Main Hall',
    category: 'Fundraising', capacity: 96, reservedTickets: 78, bookingClosesLabel: 'Bookings close 8 October at 18:00', featured: true,
  }),
  event({
    id: 'evt_winter_market', organisationId: 'org_westbrook_pta', name: 'Westbrook Winter Market',
    summary: 'Independent makers, pupil performances and festive food supporting the school library.',
    description: 'Browse local maker stalls, hear short pupil performances and warm up with seasonal food and drink.',
    startsAt: '2026-12-05T11:00:00Z', dateLabel: 'Saturday 5 December 2026',
    dateShort: { day: '05', month: 'DEC' }, timeLabel: '11:00–15:00', venue: 'Westbrook Main Hall',
    category: 'Fundraising', capacity: 220, reservedTickets: 154, bookingClosesLabel: 'Bookings close 4 December at 18:00',
  }),
  event({
    id: 'evt_uniform_swap', organisationId: 'org_westbrook_pta', name: 'New Year Uniform Swap',
    summary: 'Pass on good-quality uniform and find the next size without buying new.',
    description: 'Bring clean, labelled uniform to swap or collect what your family needs. No donation is required to attend.',
    startsAt: '2027-01-09T10:00:00Z', dateLabel: 'Saturday 9 January 2027',
    dateShort: { day: '09', month: 'JAN' }, timeLabel: '10:00–12:00', venue: 'Westbrook Dining Hall',
    category: 'Community', capacity: 90, reservedTickets: 34, bookingClosesLabel: 'Bookings close 8 January at 18:00',
  }),
  event({
    id: 'evt_harvest_lunch', organisationId: 'org_st_lukes', name: 'Community Harvest Lunch',
    summary: 'A free shared lunch open to neighbours of every age and background.',
    description: 'Come alone or with family for a relaxed two-course lunch. Vegetarian and allergy-aware options are available.',
    startsAt: '2026-09-27T12:30:00+01:00', dateLabel: 'Sunday 27 September 2026',
    dateShort: { day: '27', month: 'SEP' }, timeLabel: '12:30–14:30', venue: 'St Luke’s Church Hall',
    category: 'Community', capacity: 84, reservedTickets: 61, bookingClosesLabel: 'Bookings close 25 September at 18:00', featured: true,
  }),
  event({
    id: 'evt_toddler_music', organisationId: 'org_st_lukes', name: 'Toddler Music Morning',
    summary: 'Songs, simple instruments and refreshments for under-fives and their grown-ups.',
    description: 'A welcoming music session led by local volunteers. Instruments are provided and siblings are welcome.',
    startsAt: '2026-11-03T10:00:00Z', dateLabel: 'Tuesday 3 November 2026',
    dateShort: { day: '03', month: 'NOV' }, timeLabel: '10:00–11:15', venue: 'Garden Room',
    category: 'Family', capacity: 36, reservedTickets: 28, bookingClosesLabel: 'Bookings close 2 November at 18:00',
  }),
  event({
    id: 'evt_carol_evening', organisationId: 'org_st_lukes', name: 'Neighbourhood Carol Evening',
    summary: 'Seasonal music, readings and hot drinks for the whole neighbourhood.',
    description: 'An informal evening featuring local choirs and familiar carols. Step-free seating is available.',
    startsAt: '2026-12-18T18:30:00Z', dateLabel: 'Friday 18 December 2026',
    dateShort: { day: '18', month: 'DEC' }, timeLabel: '18:30–20:00', venue: 'Main Church',
    category: 'Performance', capacity: 160, reservedTickets: 121, bookingClosesLabel: 'Bookings close 17 December at 18:00',
  }),
  event({
    id: 'evt_print_workshop', organisationId: 'org_lantern_rooms', name: 'Family Printmaking Workshop',
    summary: 'Make bold, colourful prints together in a relaxed two-hour workshop.',
    description: 'A local artist will guide families through safe block-printing techniques. All materials are supplied.',
    startsAt: '2026-09-26T10:30:00+01:00', dateLabel: 'Saturday 26 September 2026',
    dateShort: { day: '26', month: 'SEP' }, timeLabel: '10:30–12:30', venue: 'Studio One',
    category: 'Workshop', capacity: 30, reservedTickets: 24, bookingClosesLabel: 'Bookings close 25 September at 16:00', featured: true,
  }),
  event({
    id: 'evt_folk_session', organisationId: 'org_lantern_rooms', name: 'Friday Folk Session',
    summary: 'An acoustic evening featuring three independent musicians from the South West.',
    description: 'Doors open at 19:00 for an intimate seated performance with a short interval.',
    startsAt: '2026-11-20T19:30:00Z', dateLabel: 'Friday 20 November 2026',
    dateShort: { day: '20', month: 'NOV' }, timeLabel: '19:30–22:00', venue: 'The Lantern Rooms',
    category: 'Performance', capacity: 72, reservedTickets: 63, bookingClosesLabel: 'Bookings close 20 November at 17:00',
  }),
  event({
    id: 'evt_venue_open_day', organisationId: 'org_lantern_rooms', name: 'Venue Open Day',
    summary: 'Tour the rooms, meet local suppliers and discuss plans for your next gathering.',
    description: 'Drop in for a guided look around the venue and practical advice from the events team.',
    startsAt: '2027-02-06T11:00:00Z', dateLabel: 'Saturday 6 February 2027',
    dateShort: { day: '06', month: 'FEB' }, timeLabel: '11:00–15:00', venue: 'The Lantern Rooms',
    category: 'Community', capacity: 100, reservedTickets: 39, bookingClosesLabel: 'Bookings close 5 February at 18:00',
  }),
  event({
    id: 'evt_coding_club', organisationId: 'org_harbour_youth', name: 'Saturday Coding Club',
    summary: 'A beginner-friendly morning building small games and creative web projects.',
    description: 'Young people aged 11–15 can learn alongside volunteer mentors. Laptops and refreshments are provided.',
    startsAt: '2026-10-17T10:00:00+01:00', dateLabel: 'Saturday 17 October 2026',
    dateShort: { day: '17', month: 'OCT' }, timeLabel: '10:00–12:30', venue: 'Harbour Workshop',
    category: 'Workshop', capacity: 28, reservedTickets: 22, bookingClosesLabel: 'Bookings close 16 October at 18:00', featured: true,
  }),
  event({
    id: 'evt_family_cookalong', organisationId: 'org_harbour_youth', name: 'Family Winter Cook-along',
    summary: 'Cook an affordable winter meal together and take the recipe home.',
    description: 'A practical family session for ages eight and up. Ingredients, equipment and aprons are supplied.',
    startsAt: '2026-11-28T11:00:00Z', dateLabel: 'Saturday 28 November 2026',
    dateShort: { day: '28', month: 'NOV' }, timeLabel: '11:00–13:00', venue: 'Community Kitchen',
    category: 'Family', capacity: 32, reservedTickets: 19, bookingClosesLabel: 'Bookings close 26 November at 18:00',
  }),
  event({
    id: 'evt_mentor_intro', organisationId: 'org_harbour_youth', name: 'Volunteer Mentor Introduction',
    summary: 'Learn how local adults can support young people through monthly mentoring.',
    description: 'Meet the project team, understand the safeguarding process and hear from current volunteer mentors.',
    startsAt: '2027-01-14T18:00:00Z', dateLabel: 'Thursday 14 January 2027',
    dateShort: { day: '14', month: 'JAN' }, timeLabel: '18:00–19:30', venue: 'Harbour Meeting Room',
    category: 'Community', capacity: 40, reservedTickets: 14, bookingClosesLabel: 'Bookings close 13 January at 18:00',
  }),
  event({
    id: 'evt_family_sports', organisationId: 'org_redland_sports', name: 'Family Sports Taster Day',
    summary: 'Try short, friendly sessions in football, tennis and athletics.',
    description: 'Coaches will run rotating taster sessions for primary-aged children and their adults. Equipment is provided.',
    startsAt: '2026-09-12T10:00:00+01:00', dateLabel: 'Saturday 12 September 2026',
    dateShort: { day: '12', month: 'SEP' }, timeLabel: '10:00–13:00', venue: 'Redland Sports Ground',
    category: 'Family', capacity: 120, reservedTickets: 87, bookingClosesLabel: 'Bookings close 11 September at 18:00', featured: true,
  }),
  event({
    id: 'evt_coach_workshop', organisationId: 'org_redland_sports', name: 'Inclusive Coaching Workshop',
    summary: 'Practical ideas for making community sport welcoming to more participants.',
    description: 'A facilitated workshop for volunteer coaches covering adaptation, communication and inclusive session planning.',
    startsAt: '2026-11-07T09:30:00Z', dateLabel: 'Saturday 7 November 2026',
    dateShort: { day: '07', month: 'NOV' }, timeLabel: '09:30–12:30', venue: 'Clubhouse',
    category: 'Workshop', capacity: 36, reservedTickets: 25, bookingClosesLabel: 'Bookings close 6 November at 18:00',
  }),
  event({
    id: 'evt_winter_walk', organisationId: 'org_redland_sports', name: 'New Year Community Walk',
    summary: 'A sociable, accessible local walk followed by tea at the clubhouse.',
    description: 'Choose a two-kilometre or five-kilometre route led by club volunteers. Both routes finish at the clubhouse.',
    startsAt: '2027-01-02T10:30:00Z', dateLabel: 'Saturday 2 January 2027',
    dateShort: { day: '02', month: 'JAN' }, timeLabel: '10:30–12:30', venue: 'Redland Sports Ground',
    category: 'Community', capacity: 100, reservedTickets: 46, bookingClosesLabel: 'Bookings close 1 January at 12:00',
  }),
] as const

export const getOrganisationEvents = (organisationId: string): readonly DemoEvent[] =>
  demoEvents.filter((item) => item.organisationId === organisationId)
