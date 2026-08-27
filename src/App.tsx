import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  demoEvents,
  organisation,
  type DemoEvent,
  type EventCategory,
} from './demo/seed'

type IconName =
  | 'arrow'
  | 'calendar'
  | 'check'
  | 'clock'
  | 'close'
  | 'location'
  | 'search'
  | 'ticket'
  | 'users'

type BookingStage = 'event' | 'details' | 'review' | 'confirmed'
type CategoryFilter = 'All events' | EventCategory

const categories: readonly CategoryFilter[] = [
  'All events',
  'Family',
  'Fundraising',
  'Parents & carers',
]

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    location: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    ticket: (
      <path d="M4 6h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7a1 1 0 0 1 1-1Z" />
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
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
          <span className="category-label">{event.category}</span>
          {nearlyFull ? <span className="availability-warning">Filling quickly</span> : null}
        </div>
        <h3>{event.name}</h3>
        <p>{event.summary}</p>
        <div className="event-meta">
          <span>
            <Icon name="clock" /> {event.timeLabel}
          </span>
          <span>
            <Icon name="location" /> {event.venue}
          </span>
          <span>
            <Icon name="ticket" /> {event.availabilityLabel}
          </span>
        </div>
      </div>
      <button className="text-action" type="button" onClick={() => onSelect(event)}>
        View event <Icon name="arrow" />
      </button>
    </article>
  )
}

function App() {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All events')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<DemoEvent | null>(null)
  const [bookingStage, setBookingStage] = useState<BookingStage>('event')
  const [ticketCount, setTicketCount] = useState(2)
  const [bookingName, setBookingName] = useState('')
  const [bookingEmail, setBookingEmail] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  const featuredEvent = demoEvents.find((event) => event.featured) ?? demoEvents[0]
  const isFiltering = activeCategory !== 'All events' || searchQuery.trim().length > 0

  const visibleEvents = useMemo(() => {
    const normalisedQuery = searchQuery.trim().toLocaleLowerCase('en-GB')

    return demoEvents.filter((event) => {
      if (!isFiltering && event.featured) return false
      const categoryMatches = activeCategory === 'All events' || event.category === activeCategory
      const queryMatches =
        normalisedQuery.length === 0 ||
        [event.name, event.summary, event.venue, event.category].some((value) =>
          value.toLocaleLowerCase('en-GB').includes(normalisedQuery),
        )
      return categoryMatches && queryMatches
    })
  }, [activeCategory, isFiltering, searchQuery])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!selectedEvent || !dialog || dialog.open) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }, [selectedEvent])

  const openEvent = (event: DemoEvent) => {
    setSelectedEvent(event)
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
      <a className="skip-link" href="#events">
        Skip to events
      </a>

      <header className="site-header">
        <div className="header-inner">
          <a className="attendly-brand" href="#top" aria-label="Attendly home">
            <img src="/attendly-logo.png" alt="Attendly" />
          </a>
          <nav aria-label="Main navigation">
            <a href="#events">Events</a>
            <a href="#booking">How booking works</a>
          </nav>
          <a className="organiser-link" href="#organiser-access">
            Organiser sign in
          </a>
        </div>
      </header>

      <main id="top">
        <section className="organisation-hero" aria-labelledby="hero-title">
          <div className="hero-inner">
            <div className="organisation-lockup">
              <div className="school-mark" aria-hidden="true">W</div>
              <div>
                <p>{organisation.location}</p>
                <strong>{organisation.name}</strong>
              </div>
            </div>
            <div className="hero-copy">
              <h1 id="hero-title">What’s on at Westbrook</h1>
              <p>{organisation.description}</p>
            </div>
            <label className="event-search">
              <span className="sr-only">Search events</span>
              <Icon name="search" size={20} />
              <input
                type="search"
                placeholder="Search events, venues or activities"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
          </div>
        </section>

        {!isFiltering ? (
          <section className="featured-section" aria-labelledby="featured-title">
            <div className="section-inner">
              <p className="section-label">Coming up next</p>
              <article className="featured-event">
                <div className="featured-copy">
                  <span className="category-label category-label-on-dark">{featuredEvent.category}</span>
                  <h2 id="featured-title">{featuredEvent.name}</h2>
                  <p>{featuredEvent.summary}</p>
                  <div className="featured-meta">
                    <span><Icon name="calendar" /> {featuredEvent.dateLabel}</span>
                    <span><Icon name="clock" /> {featuredEvent.timeLabel}</span>
                    <span><Icon name="location" /> {featuredEvent.venue}</span>
                  </div>
                  <button className="button button-light" type="button" onClick={() => openEvent(featuredEvent)}>
                    View event and book <Icon name="arrow" />
                  </button>
                </div>
                <div className="featured-date" aria-hidden="true">
                  <span>{featuredEvent.dateShort.month}</span>
                  <strong>{featuredEvent.dateShort.day}</strong>
                  <small>Free entry</small>
                </div>
              </article>
            </div>
          </section>
        ) : null}

        <section className="events-section" id="events" aria-labelledby="events-title">
          <div className="section-inner">
            <div className="events-heading">
              <div>
                <h2 id="events-title">{isFiltering ? 'Event results' : 'More upcoming events'}</h2>
                <p>Free events for Westbrook families and the wider community.</p>
              </div>
              <span className="result-count" aria-live="polite">
                {visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}
              </span>
            </div>

            <div className="category-filters" aria-label="Filter events by category">
              {categories.map((category) => (
                <button
                  className={activeCategory === category ? 'filter-chip active' : 'filter-chip'}
                  type="button"
                  aria-pressed={activeCategory === category}
                  key={category}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="event-list">
              {visibleEvents.length > 0 ? (
                visibleEvents.map((event) => <EventRow event={event} key={event.id} onSelect={openEvent} />)
              ) : (
                <div className="empty-state">
                  <Icon name="calendar" size={24} />
                  <h3>No events match that search</h3>
                  <p>Try a different word or show all event categories.</p>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setActiveCategory('All events')
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="booking-explainer" id="booking" aria-labelledby="booking-title">
          <div className="section-inner explainer-layout">
            <div>
              <h2 id="booking-title">Booking is simple</h2>
              <p>
                Choose an event, tell us how many people are coming, and review the details before you confirm.
              </p>
            </div>
            <ol>
              <li><span>1</span><div><strong>Choose an event</strong><p>See dates, times and remaining availability.</p></div></li>
              <li><span>2</span><div><strong>Add your group</strong><p>One booking can include adults and children.</p></div></li>
              <li><span>3</span><div><strong>Review and confirm</strong><p>You stay in control before anything is booked.</p></div></li>
            </ol>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-inner">
          <div>
            <img src="/attendly-logo.png" alt="Attendly" />
            <p>Simple event sign-ups and door check-in for community organisers.</p>
          </div>
          <div className="footer-links">
            <a href="#events">Browse events</a>
            <a href="#booking">Booking help</a>
            <span id="organiser-access">Organiser access</span>
          </div>
          <p className="demo-disclosure">
            This is a fictional organisation with synthetic event data, created for the OpenAI WebMCP Challenge.
          </p>
        </div>
      </footer>

      {selectedEvent ? (
        <dialog
          className="event-dialog"
          ref={dialogRef}
          aria-labelledby="dialog-title"
          onClose={() => setSelectedEvent(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEvent()
          }}
        >
          <div className="dialog-panel">
            <div className="dialog-header">
              <button className="icon-button" type="button" onClick={closeEvent} aria-label="Close event details">
                <Icon name="close" size={20} />
              </button>
            </div>

            {bookingStage === 'event' ? (
              <div className="dialog-content">
                <span className="category-label">{selectedEvent.category}</span>
                <h2 id="dialog-title">{selectedEvent.name}</h2>
                <p className="dialog-intro">{selectedEvent.description}</p>
                <dl className="detail-list">
                  <div><dt><Icon name="calendar" /> Date</dt><dd>{selectedEvent.dateLabel}</dd></div>
                  <div><dt><Icon name="clock" /> Time</dt><dd>{selectedEvent.timeLabel}</dd></div>
                  <div><dt><Icon name="location" /> Venue</dt><dd>{selectedEvent.venue}</dd></div>
                  <div><dt><Icon name="ticket" /> Tickets</dt><dd>{selectedEvent.availabilityLabel}</dd></div>
                </dl>
                <div className="booking-callout">
                  <div>
                    <strong>Free entry</strong>
                    <span>{selectedEvent.bookingClosesLabel}</span>
                  </div>
                  <button className="button button-primary" type="button" onClick={() => setBookingStage('details')}>
                    Book free tickets
                  </button>
                </div>
              </div>
            ) : null}

            {bookingStage === 'details' ? (
              <form className="dialog-content booking-form" onSubmit={submitDetails}>
                <button className="back-button" type="button" onClick={() => setBookingStage('event')}>← Event details</button>
                <div>
                  <p className="step-label">Your booking</p>
                  <h2 id="dialog-title">Who’s coming?</h2>
                  <p className="dialog-intro">Book up to six free places for {selectedEvent.name}.</p>
                </div>
                <label>
                  Number of people
                  <select value={ticketCount} onChange={(event) => setTicketCount(Number(event.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>
                <label>
                  Your name
                  <input required autoComplete="name" value={bookingName} onChange={(event) => setBookingName(event.target.value)} />
                </label>
                <label>
                  Email address
                  <input required type="email" autoComplete="email" value={bookingEmail} onChange={(event) => setBookingEmail(event.target.value)} />
                  <span>We’ll send the booking confirmation here.</span>
                </label>
                <button className="button button-primary button-wide" type="submit">Review booking <Icon name="arrow" /></button>
              </form>
            ) : null}

            {bookingStage === 'review' ? (
              <div className="dialog-content">
                <button className="back-button" type="button" onClick={() => setBookingStage('details')}>← Change details</button>
                <div>
                  <p className="step-label">Review</p>
                  <h2 id="dialog-title">Check your booking</h2>
                  <p className="dialog-intro">Nothing is booked until you confirm below.</p>
                </div>
                <dl className="booking-review">
                  <div><dt>Event</dt><dd>{selectedEvent.name}</dd></div>
                  <div><dt>Date</dt><dd>{selectedEvent.dateLabel}, {selectedEvent.timeLabel}</dd></div>
                  <div><dt>Places</dt><dd>{ticketCount}</dd></div>
                  <div><dt>Booked by</dt><dd>{bookingName}</dd></div>
                  <div><dt>Confirmation</dt><dd>{bookingEmail}</dd></div>
                  <div><dt>Total</dt><dd>£0.00</dd></div>
                </dl>
                <button className="button button-primary button-wide" type="button" onClick={() => setBookingStage('confirmed')}>
                  Confirm free booking
                </button>
              </div>
            ) : null}

            {bookingStage === 'confirmed' ? (
              <div className="dialog-content confirmation">
                <div className="confirmation-icon"><Icon name="check" size={28} /></div>
                <div>
                  <p className="step-label">Booking confirmed</p>
                  <h2 id="dialog-title">You’re on the list</h2>
                  <p className="dialog-intro">
                    {ticketCount} {ticketCount === 1 ? 'place is' : 'places are'} reserved for {selectedEvent.name}. A confirmation has been prepared for {bookingEmail}.
                  </p>
                </div>
                <div className="reference-box"><span>Booking reference</span><strong>WES-{selectedEvent.id.slice(-4).toUpperCase()}-{ticketCount}</strong></div>
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
