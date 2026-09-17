import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsagePage } from '../src/pages/Usage';
import { api, type Organization, type UsageSummary } from '../src/lib/api';

/**
 * Phase 17D — what the usage page may and may not say.
 *
 * Every assertion here is about a SENTENCE a customer would read, because the
 * risks in this surface are all wording: a zero that reads as "this cost you
 * nothing", a reservation figure that reads as a card's utilisation, and a
 * trail that shows only what succeeded.
 */

const org: Organization = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  role: 'owner',
  capabilities: [],
} as unknown as Organization;

function stubUsage(over: Partial<UsageSummary> = {}): UsageSummary {
  return {
    acceleratorSeconds: 7200,
    rateConfigured: false,
    from: '2026-08-15T00:00:00Z',
    to: '2026-09-14T00:00:00Z',
    lines: [
      {
        kind: 'service',
        name: 'qwen-local',
        nodeName: 'nodeforge',
        modelId: 'qwen3-8b-q4km',
        acceleratorSeconds: 7200,
        intervals: 3,
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'usageRate').mockResolvedValue({ perAcceleratorHour: null });
  vi.spyOn(api, 'auditEvents').mockResolvedValue({ events: [], retentionDays: 365 });
});

describe('a cost is absent rather than zero', () => {
  it('says WHY there is no cost when nobody entered a rate', async () => {
    vi.spyOn(api, 'usage').mockResolvedValue(stubUsage());
    render(<UsagePage org={org} />);

    const note = await screen.findByTestId('usage-no-cost');
    expect(note.textContent).toMatch(/nobody has entered a rate/i);
    // AND IT SAYS WHOSE KNOWLEDGE IS MISSING. "No rate" alone reads as a
    // setting somebody forgot; naming what Nodeau does not know is the honest
    // version and is the claim §2.3 protects.
    expect(note.textContent).toMatch(/does not know what your electricity/i);
    expect(screen.queryByTestId('usage-cost')).toBeNull();
  });

  it('distinguishes "no rate" from "a rate and nothing to apply it to"', async () => {
    vi.spyOn(api, 'usage').mockResolvedValue(
      stubUsage({ acceleratorSeconds: 0, lines: [], rateConfigured: true }),
    );
    render(<UsagePage org={org} />);

    const note = await screen.findByTestId('usage-no-cost');
    expect(note.textContent).toMatch(/there is no usage in this window/i);
    expect(note.textContent).not.toMatch(/nobody has entered a rate/i);
  });

  it('shows a cost as the CUSTOMER’S figure applied to a measurement', async () => {
    vi.spyOn(api, 'usage').mockResolvedValue(
      stubUsage({ rateConfigured: true, estimatedCost: 0.5, currency: 'USD' }),
    );
    render(<UsagePage org={org} />);

    const cost = await screen.findByTestId('usage-cost');
    expect(cost.textContent).toMatch(/USD/);
    expect(cost.textContent).toMatch(/the rate your organisation entered/i);
    expect(cost.textContent).toMatch(/Nodeau does not know what your power or\s+hardware costs/i);
  });
});

describe('the figure reads as a sentence', () => {
  it('says one accelerator-hour, not one accelerator-hours', async () => {
    vi.spyOn(api, 'usage').mockResolvedValue(
      stubUsage({
        acceleratorSeconds: 3600,
        lines: [
          {
            kind: 'batch',
            name: 'nightly',
            nodeName: 'nodeau-c',
            modelId: 'qwen3-4b-q4km',
            acceleratorSeconds: 3600,
            intervals: 1,
          },
        ],
      }),
    );
    render(<UsagePage org={org} />);

    await screen.findByTestId('usage-total');
    expect(screen.getByRole('heading', { name: '1 accelerator-hour' })).toBeInTheDocument();
    expect(screen.queryByText(/\b1 accelerator-hours/)).not.toBeInTheDocument();
  });
});

describe('the figure is about a reservation, never about a card', () => {
  it('names accelerator-hours and never utilisation', async () => {
    vi.spyOn(api, 'usage').mockResolvedValue(stubUsage());
    render(<UsagePage org={org} />);

    const total = await screen.findByTestId('usage-total');
    expect(total.textContent).toMatch(/accelerator-hours/);

    // The forbidden words, anywhere on the page. `CLAUDE.md` §2.3: a
    // device-total figure is not the workload's own, and issue #17 refuses the
    // per-process measurement that would make any of these sayable.
    const body = document.body.textContent ?? '';
    for (const word of ['utilisation', 'utilization', '% busy', 'GPU load', 'tokens']) {
      expect(body.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it('shows a custom model by its bytes as well as its alias', async () => {
    vi.spyOn(api, 'usage').mockResolvedValue(
      stubUsage({
        lines: [
          {
            kind: 'service',
            name: 'mine',
            modelId: 'my-model',
            modelSha256: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            acceleratorSeconds: 60,
            intervals: 1,
          },
        ],
      }),
    );
    render(<UsagePage org={org} />);
    const table = await screen.findByTestId('usage-lines');
    // Two quantisations can share one alias; only the digest separates them.
    expect(table.textContent).toContain('abcdef012345');
  });
});

describe('the audit trail shows refusals', () => {
  beforeEach(() => {
    vi.spyOn(api, 'usage').mockResolvedValue(stubUsage());
  });

  it('renders a refusal as a refusal', async () => {
    vi.spyOn(api, 'auditEvents').mockResolvedValue({
      retentionDays: 365,
      events: [
        {
          type: 'fleet.channel_policy_changed',
          occurredAt: new Date().toISOString(),
          result: 'refused',
          target: 'inst-0123456789abcdef',
        },
      ],
    });
    render(<UsagePage org={org} />);
    expect(await screen.findByTestId('audit-refused')).toBeTruthy();
  });

  // AN EVENT WITH NO RESULT PREDATES THE COLUMN AND IS NOT A SUCCESS.
  it('does not render a missing result as applied', async () => {
    vi.spyOn(api, 'auditEvents').mockResolvedValue({
      retentionDays: 365,
      events: [{ type: 'user.signed_in', occurredAt: new Date().toISOString() }],
    });
    render(<UsagePage org={org} />);
    const table = await screen.findByTestId('audit-events');
    expect(table.textContent).toContain('not recorded');
    expect(table.textContent).not.toContain('applied');
  });

  it('states the retention with the data', async () => {
    render(<UsagePage org={org} />);
    const audit = await screen.findByTestId('audit');
    // A reader who sees the oldest record must be able to tell "this is all
    // there was" from "this is all that is kept".
    await waitFor(() => expect(audit.textContent).toMatch(/365 days/));
  });

  it('can ask for only the refusals', async () => {
    const spy = vi.spyOn(api, 'auditEvents').mockResolvedValue({
      retentionDays: 365,
      events: [],
    });
    render(<UsagePage org={org} />);
    await screen.findByTestId('audit');
    await userEvent.click(screen.getByLabelText(/only things that were refused/i));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        org.id,
        expect.objectContaining({ result: 'refused' }),
        expect.anything(),
      ),
    );
  });
});

describe('the page is not a billing surface', () => {
  /**
   * THE FORBIDDEN SET IS PHRASES THAT CAN ONLY BE CLAIMS, NOT WORDS.
   *
   * The first version of this test forbade the bare word "bill" and failed on
   * the page's own sentence — "these are figures about what was reserved … and
   * not a bill" — which is the page CORRECTLY disclaiming the thing the test
   * exists to forbid.
   *
   * That is issue #101's class for the fourth time in this codebase: a guard
   * that rejected a comment explaining the rule it enforces, a second in
   * `dashboard.html`, a release smoke matching "full" inside "successfully",
   * and now this. The false positive is in the safe direction every time,
   * which is exactly why it keeps recurring and never gets fixed properly.
   *
   * So the set is phrases a page could only carry if it really were a billing
   * surface. A disclaimer cannot contain "amount due"; a bill cannot avoid it.
   */
  const claimsOnlyABillingSurfaceCanMake = [
    'invoice',
    'amount due',
    'you will be charged',
    'billed to',
    'payment method',
    'per token',
    'per 1,000 tokens',
    'total charge',
  ];

  it('makes no claim only a billing surface could make', async () => {
    vi.spyOn(api, 'usage').mockResolvedValue(
      stubUsage({ rateConfigured: true, estimatedCost: 12.5, currency: 'GBP' }),
    );
    render(<UsagePage org={org} />);
    await screen.findByTestId('usage-total');

    const body = (document.body.textContent ?? '').toLowerCase();
    for (const phrase of claimsOnlyABillingSurfaceCanMake) {
      expect(body, `the page says "${phrase}"`).not.toContain(phrase);
    }
  });

  // AND THE PAGE SAYS SO OUT LOUD, which the check above cannot assert by
  // absence. A page that merely omits the word is one edit away from carrying
  // it; a page that states what it is not has told the reader.
  it('says what it is not, so a reader does not have to infer it', async () => {
    vi.spyOn(api, 'usage').mockResolvedValue(stubUsage());
    render(<UsagePage org={org} />);
    await screen.findByTestId('usage-total');
    expect((document.body.textContent ?? '').toLowerCase()).toContain('not a bill');
  });
});
