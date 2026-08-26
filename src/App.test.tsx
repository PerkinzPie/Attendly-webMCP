import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Attendly-webMCP foundation', () => {
  it('identifies the project and its synthetic-data boundary', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Attendly-webMCP' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Every event and person.*synthetic/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No existing Attendly source code or customer data/i),
    ).toBeInTheDocument()
  })

  it('renders the deterministic starting event', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Riverside Community Workshop' }),
    ).toBeInTheDocument()
    expect(screen.getByText('4 free places remaining')).toBeInTheDocument()
  })
})
