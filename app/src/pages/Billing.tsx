import { api, type Organization, type Plan } from '../lib/api';
import { ErrorNotice, Spinner } from '../components/ui';
import { useResource } from '../lib/useResource';

/**
 * Where the billing provider sends the customer back.
 *
 * # The redirect is not evidence of payment, and this page never treats it as any
 *
 * `/billing/complete` is a URL the customer's browser was pointed at. Anyone can
 * type it. What actually confers a plan is stored subscription state, which the
 * API learns from a signature-verified webhook — so this page reads the plan
 * back from the API rather than asserting anything from the fact it was
 * rendered. If the webhook has not landed yet, it says so plainly instead of
 * claiming an upgrade that has not happened.
 *
 * That is also why the success copy is careful: "payment went through" is what
 * the provider told the browser; "your plan is Home Pro" is only said when the
 * API says so.
 *
 * # Why this page exists at all
 *
 * `handleStartCheckout` sets SuccessURL to /billing/complete and CancelURL to
 * /billing. Before this page, neither route was parsed, so the router fell
 * through to `notfound` — a customer finished paying and landed on "not found".
 */
export function BillingPage({
  org,
  complete,
  navigate,
}: {
  org: Organization;
  complete: boolean;
  navigate: (to: string) => void;
}) {
  const [state, reload] = useResource<Plan>((signal) => api.plan(org.id, signal), [org.id]);

  if (state.status === 'loading') return <Spinner label="Checking your plan…" />;
  if (state.status === 'error') return <ErrorNotice error={state.error} onRetry={reload} />;

  const plan = state.data;

  // Cancelled: the customer backed out at the provider. Nothing was charged and
  // nothing changed, and saying so is kinder than silence.
  if (!complete) {
    return (
      <section className="narrow">
        <div className="notice">
          <h1>Checkout cancelled</h1>
          <p>
            You were not charged and nothing about {org.name} has changed. You are still on{' '}
            {plan.displayName}.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/plan')}>
            Back to plans
          </button>
        </div>
      </section>
    );
  }

  // Success return. The provider says the payment went through; whether the
  // subscription has reached us is a separate fact, and the two are reported
  // separately rather than merged into a reassuring one.
  const upgraded = plan.id !== 'home';

  return (
    <section className="narrow">
      <div className={upgraded ? 'notice notice-ok' : 'notice'}>
        <h1>{upgraded ? `You are on ${plan.displayName}` : 'Payment received'}</h1>
        {upgraded ? (
          <p>
            {org.name} is on {plan.displayName}. Your machines pick this up the next time they
            refresh their entitlement — Nodeau verifies entitlements offline, so nothing has to
            be reachable for inference to keep working.
          </p>
        ) : (
          <p>
            Your payment went through. We have not finished recording it yet — a plan changes
            only once the provider's confirmation reaches us and is verified, which is usually
            seconds. This page does not have to stay open.
          </p>
        )}
        <div className="row-actions">
          <button className="btn btn-primary" onClick={() => navigate('/plan')}>
            View plan
          </button>
          {!upgraded && (
            <button className="btn" onClick={reload}>
              Check again
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
