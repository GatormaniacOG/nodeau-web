import { signInURL } from '../lib/api';
import type { Route } from '../lib/router';

/**
 * The signed-out page, and the place every failed login lands.
 *
 * # Failure reasons are shown, not swallowed
 *
 * The API redirects here with `?error=` when a login could not be completed.
 * Each case has a different remedy, and collapsing them into "sign-in failed"
 * would leave somebody retrying a flow that will never work — the
 * different-method case in particular, which no amount of retrying fixes.
 */
export function SignInPage({ route }: { route: Route }) {
  const error = route.name === 'signin' ? route.error : undefined;
  // Come back to whatever was being visited, unless it was the sign-in page.
  const returnTo =
    route.name === 'signin' ? '/' : window.location.pathname + window.location.search;

  return (
    <section className="narrow signin">
      <h1>Sign in to Nodeau</h1>
      <p className="muted">
        Manage your account, your plan and the machines linked to it.
      </p>

      {error && <SignInError error={error} />}

      <p>
        <a className="btn btn-primary" href={signInURL(returnTo)}>
          Continue
        </a>
      </p>

      <div className="panel quiet">
        <h2>You do not need an account to use Nodeau</h2>
        <p className="muted">
          Nodeau Home runs on your own machine with no sign-in at all: local inference,
          batch jobs, the local dashboard, model verification and safe scheduling. Signing
          in adds an account, a record of your installations, and a paid plan if you want
          one — it does not turn Nodeau into software that needs this site.
        </p>
      </div>
    </section>
  );
}

function SignInError({ error }: { error: string }) {
  const messages: Record<string, { title: string; body: string }> = {
    provider: {
      title: 'Sign-in did not complete',
      body: 'The identity provider did not return a usable result. Trying again usually works.',
    },
    expired: {
      title: 'That sign-in took too long',
      body: 'The attempt expired, or it was started in a different browser. Start again from here.',
    },
    state: {
      title: 'That sign-in could not be verified',
      body:
        'The response did not match the request this browser started, so it was refused. ' +
        'Start again from here. If it keeps happening, make sure cookies are allowed for ' +
        'this site.',
    },
    'different-method': {
      title: 'That address already has an account',
      body:
        'An account already exists for that email address using a different sign-in method. ' +
        'Sign in the way you did the first time — retrying with this method will not work.',
    },
  };
  const m = messages[error] ?? {
    title: 'Sign-in did not complete',
    body: 'Please try again.',
  };
  return (
    <div className="notice notice-error" role="alert">
      <h3>{m.title}</h3>
      <p>{m.body}</p>
    </div>
  );
}
