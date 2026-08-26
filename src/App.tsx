import './App.css'
import { demoEvents } from './demo/seed'

const primaryEvent = demoEvents[0]

function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#main" aria-label="Attendly-webMCP home">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>Attendly-webMCP</span>
        </a>
        <span className="challenge-label">WebMCP Challenge demo</span>
      </header>

      <main id="main">
        <section className="hero-panel" aria-labelledby="hero-title">
          <p className="eyebrow">Events, made agent-ready</p>
          <h1 id="hero-title">Attendly-webMCP</h1>
          <p className="hero-copy">
            A lightweight, standalone representation of Attendly for exploring
            how guests, organisers and AI agents can work with the same event
            website.
          </p>
          <div className="notice" role="note">
            <strong>Demonstration environment</strong>
            <span>
              Every event and person in this application is synthetic. No
              existing Attendly source code or customer data is used.
            </span>
          </div>
        </section>

        <section className="journeys" aria-labelledby="journeys-title">
          <div className="section-heading">
            <p className="eyebrow">Planned journeys</p>
            <h2 id="journeys-title">One site, two perspectives</h2>
          </div>

          <div className="journey-grid">
            <article className="journey-card">
              <span className="card-number" aria-hidden="true">
                01
              </span>
              <h3>For guests</h3>
              <p>
                Discover suitable events and prepare a free family-ticket
                booking for review.
              </p>
            </article>
            <article className="journey-card">
              <span className="card-number" aria-hidden="true">
                02
              </span>
              <h3>For organisers</h3>
              <p>
                Create events, understand attendance and resolve check-in or
                evacuation-accountability exceptions.
              </p>
            </article>
          </div>
        </section>

        <section className="seed-preview" aria-labelledby="seed-title">
          <div>
            <p className="eyebrow">Synthetic starting point</p>
            <h2 id="seed-title">{primaryEvent.name}</h2>
            <p>{primaryEvent.summary}</p>
          </div>
          <dl className="event-facts">
            <div>
              <dt>Date</dt>
              <dd>{primaryEvent.dateLabel}</dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{primaryEvent.venue}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{primaryEvent.availabilityLabel}</dd>
            </div>
          </dl>
        </section>
      </main>

      <footer>
        <span>Open-source competition project</span>
        <a href="https://openai.com/webmcp-challenge/">About the challenge</a>
      </footer>
    </div>
  )
}

export default App
