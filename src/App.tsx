import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  demoEvents,
  demoOrganisations,
  getOrganisationEvents,
  organisationTypes,
  type DemoEvent,
  type DemoOrganisation,
  type EventCategory,
  type OrganisationType,
} from './demo/seed'

type IconName = 'arrow' | 'calendar' | 'check' | 'clock' | 'close' | 'location' | 'search' | 'ticket'
type BookingStage = 'event' | 'details' | 'review' | 'confirmed'
type OrganisationFilter = 'All organisations' | OrganisationType
type EventFilter = 'All events' | EventCategory

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    ticket: <path d="M4 6h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7a1 1 0 0 1 1-1Z" />,
  }

  return (
    <svg aria-hidden="true" className="icon" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{paths[name]}</g>
    </svg>
  )
}

function SearchField({ label, placeholder, value, onChange }: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="search-field">
      <span className="sr-only">{label}</span>
      <Icon name="search" size={20} />
      <input type="search" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
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

function App() {
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

  const selectedOrganisation = demoOrganisations.find((item) => item.id === selectedOrganisationId) ?? null
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

  const scrollToTop = () => {
    const top = document.getElementById('top')
    if (top && typeof top.scrollIntoView === 'function') top.scrollIntoView({ block: 'start' })
  }

  const selectOrganisation = (organisation: DemoOrganisation) => {
    setSelectedOrganisationId(organisation.id)
    setEventQuery('')
    setEventFilter('All events')
    requestAnimationFrame(scrollToTop)
  }

  const showDirectory = () => {
    setSelectedOrganisationId(null)
    requestAnimationFrame(scrollToTop)
  }

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
      <a className="skip-link" href={selectedOrganisation ? '#events' : '#organisations'}>Skip to results</a>

      <header className="site-header">
        <div className="header-inner">
          <button className="attendly-brand" type="button" onClick={showDirectory} aria-label="Attendly home">
            <img src="/attendly-logo.png" alt="Attendly" />
          </button>
          <nav aria-label="Main navigation">
            <button type="button" onClick={showDirectory}>Organisations</button>
            <a href="#how-it-works">How it works</a>
          </nav>
          <span className="header-context">Community events</span>
        </div>
      </header>

      <main id="top">
        {selectedOrganisation ? (
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
                  <h1 id="directory-title">Find events in your community</h1>
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
          <div className="footer-links"><button type="button" onClick={showDirectory}>Browse organisations</button><a href="#how-it-works">How it works</a></div>
          <p className="demo-disclosure">All organisations, people and events shown here are fictional and use synthetic data for the OpenAI WebMCP Challenge.</p>
        </div>
      </footer>

      {selectedEvent ? (
        <dialog className="event-dialog" ref={dialogRef} aria-labelledby="dialog-title" onClose={() => setSelectedEvent(null)} onClick={(event) => { if (event.target === event.currentTarget) closeEvent() }}>
          <div className="dialog-panel">
            <div className="dialog-header"><button className="icon-button" type="button" onClick={closeEvent} aria-label="Close event details"><Icon name="close" size={20} /></button></div>
            {bookingStage === 'event' ? (
              <div className="dialog-content">
                <span className="type-label">{selectedEvent.category}</span>
                <div><p className="dialog-owner">Hosted by {selectedOrganisation?.name}</p><h2 id="dialog-title">{selectedEvent.name}</h2></div>
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
                  <div><dt>Organisation</dt><dd>{selectedOrganisation?.name}</dd></div><div><dt>Event</dt><dd>{selectedEvent.name}</dd></div><div><dt>Date</dt><dd>{selectedEvent.dateLabel}, {selectedEvent.timeLabel}</dd></div><div><dt>Places</dt><dd>{ticketCount}</dd></div><div><dt>Booked by</dt><dd>{bookingName}</dd></div><div><dt>Confirmation</dt><dd>{bookingEmail}</dd></div><div><dt>Total</dt><dd>£0.00</dd></div>
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
