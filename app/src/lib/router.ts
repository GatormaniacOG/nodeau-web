import { useCallback, useEffect, useState } from 'react';

/**
 * A router in forty lines.
 *
 * # Why not react-router
 *
 * This application has six routes and one dynamic segment. A routing library
 * would add a dependency tree, a nested-route API and a data-loading model to
 * solve a problem that is `switch (path)`. The Phase 7C brief §34 asks for a
 * simple SPA and for libraries with a real purpose; this is the shape that
 * request has.
 *
 * The History API is used directly, so deep links, the back button and a
 * refresh all work — which is what the Netlify SPA fallback exists to support.
 */

export type Route =
  | { name: 'dashboard' }
  | { name: 'installations' }
  | { name: 'installation'; id: string }
  | { name: 'activate'; code?: string }
  | { name: 'plan' }
  | { name: 'settings' }
  // Where the billing provider sends the customer back. `complete` is the
  // success return and `/billing` the cancel return — both are the provider's
  // redirect targets, set by the API in handleStartCheckout, so they must exist
  // here or a paid customer lands on "not found" at the worst possible moment.
  // Neither is evidence of payment: the page says what happened and reads state
  // from the API, which learns it from a verified webhook.
  | { name: 'billing'; complete: boolean }
  | { name: 'signin'; error?: string }
  | { name: 'notfound'; path: string };

export function parseRoute(pathname: string, search: string): Route {
  const params = new URLSearchParams(search);
  // Trailing slashes are stripped so /installations and /installations/ are one
  // route rather than two that differ only in whether a list renders.
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/') return { name: 'dashboard' };
  if (path === '/installations') return { name: 'installations' };
  if (path.startsWith('/installations/')) {
    const id = decodeURIComponent(path.slice('/installations/'.length));
    return id ? { name: 'installation', id } : { name: 'installations' };
  }
  if (path === '/activate') return { name: 'activate', code: params.get('code') ?? undefined };
  if (path === '/plan') return { name: 'plan' };
  if (path === '/settings') return { name: 'settings' };
  if (path === '/billing') return { name: 'billing', complete: false };
  if (path === '/billing/complete') return { name: 'billing', complete: true };
  if (path === '/signin') return { name: 'signin', error: params.get('error') ?? undefined };
  return { name: 'notfound', path };
}

export function useRoute(): [Route, (to: string) => void] {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search),
  );

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname, window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    const url = new URL(to, window.location.origin);
    setRoute(parseRoute(url.pathname, url.search));
  }, []);

  return [route, navigate];
}

/** hrefFor keeps link targets in one place, so a path change is one edit. */
export const hrefFor = {
  dashboard: () => '/',
  installations: () => '/installations',
  installation: (id: string) => `/installations/${encodeURIComponent(id)}`,
  activate: (code?: string) => (code ? `/activate?code=${encodeURIComponent(code)}` : '/activate'),
  plan: () => '/plan',
  settings: () => '/settings',
  signin: () => '/signin',
};
