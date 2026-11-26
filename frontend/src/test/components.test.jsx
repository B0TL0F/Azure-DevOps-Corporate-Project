import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Burn, Health, Progress, Status, Priority, Empty } from '../components/ui';
import { Donut, HBars, Columns } from '../components/Charts';
import { money, dueLabel, daysUntil, todayIso, initials } from '../lib/format';

describe('format helpers', () => {
  test('money uses Indian lakh and crore', () => {
    expect(money(9800000)).toBe('₹98 L');
    expect(money(13400000)).toBe('₹1.34 Cr');
    expect(money(45000)).toBe('₹45,000');
    expect(money(0)).toBe('₹0');
  });
  test('due labels count calendar days', () => {
    expect(dueLabel(todayIso())).toBe('Due today');
    const d = new Date(`${todayIso()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 3);
    expect(dueLabel(d.toISOString().slice(0, 10))).toBe('3 days overdue');
    expect(daysUntil(todayIso())).toBe(0);
  });
  test('initials', () => { expect(initials('Rohan Mehta')).toBe('RM'); expect(initials('')).toBe(''); });
});

describe('badges', () => {
  test('health shows a readable label', () => {
    render(<Health value="amber" />);
    expect(screen.getByText('At risk')).toBeInTheDocument();
  });
  test('compact health keeps the label for screen readers', () => {
    render(<Health value="red" compact />);
    expect(screen.getByText('Off track')).toHaveClass('sr-only');
  });
  test('status and priority labels', () => {
    render(<><Status value="on_hold" /><Priority value="critical" /></>);
    expect(screen.getByText('On hold')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });
  test('progress clamps to 0-100', () => {
    render(<Progress value={140} label="p" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
  test('budget burn turns red when over budget', () => {
    render(<Burn used={130} budget={100} />);
    expect(screen.getByText('130%')).toHaveClass('tone-red');
  });
  test('empty state renders its action', () => {
    render(<MemoryRouter><Empty title="Nothing here" action={<button>Do it</button>}>Body</Empty></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Do it' })).toBeInTheDocument();
  });
});

describe('charts', () => {
  test('donut totals its segments', () => {
    render(<Donut label="open" segments={[{ key: 'g', label: 'On track', value: 7, color: 'green' }, { key: 'r', label: 'Off track', value: 2, color: 'red' }]} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/On track 7, Off track 2/);
    expect(screen.getByText('9')).toBeInTheDocument();
  });
  test('hbars and columns render rows', () => {
    const { container } = render(<><HBars rows={[{ label: 'Aman', value: 110, tone: 'red' }]} suffix="%" /><Columns data={[{ week: '2026-11-16', hours: 40 }, { week: '2026-11-23', hours: 12 }]} /></>);
    expect(screen.getByText('110%')).toBeInTheDocument();
    expect(container.querySelectorAll('rect.col')).toHaveLength(2);
  });
});
