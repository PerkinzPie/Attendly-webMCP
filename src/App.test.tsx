import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Attendly event hub', () => {
  it('presents a believable organisation event site with a discreet synthetic-data boundary', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'What’s on at Westbrook' })).toBeInTheDocument()
    expect(screen.getAllByText('Westbrook Primary School').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Westbrook Autumn Fair' })).toBeInTheDocument()
    expect(screen.getByText(/fictional organisation with synthetic event data/i)).toBeInTheDocument()
  })

  it('filters upcoming events by search and category', () => {
    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('Search events, venues or activities'), {
      target: { value: 'lantern' },
    })

    expect(screen.getByRole('heading', { name: 'Community Lantern Walk' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Westbrook Winter Market' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search events, venues or activities'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Parents & carers' }))

    expect(screen.getByRole('heading', { name: 'Online Safety for Families' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reception 2027 Welcome Morning' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Year 6 Family Quiz Night' })).not.toBeInTheDocument()
  })

  it('supports a reviewable free-ticket booking journey', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /view event and book/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Book free tickets' }))

    fireEvent.change(within(dialog).getByLabelText('Your name'), { target: { value: 'Alex Morgan' } })
    fireEvent.change(within(dialog).getByLabelText(/Email address/), { target: { value: 'alex@example.test' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /review booking/i }))

    expect(within(dialog).getByRole('heading', { name: 'Check your booking' })).toBeInTheDocument()
    expect(within(dialog).getByText('Alex Morgan')).toBeInTheDocument()
    expect(within(dialog).getByText('alex@example.test')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm free booking' }))
    expect(within(dialog).getByRole('heading', { name: 'You’re on the list' })).toBeInTheDocument()
    expect(within(dialog).getByText('Booking reference')).toBeInTheDocument()
  })
})
