import { useCallback, useEffect, useState } from 'react';

/**
 * One async read, with its loading, error and retry states.
 *
 * # Why this exists rather than four copies of the same effect
 *
 * Every page here does the same thing: fetch on mount, abort on unmount, show a
 * spinner, show a typed error with a retry. Written out four times it drifted
 * immediately — and it drifted into a shape React 19 now rejects, which is what
 * prompted this.
 *
 * # The setState-in-effect rule, and why the fix is not a suppression
 *
 * `react-hooks/set-state-in-effect` fires on a synchronous `setState` at the top
 * of an effect, because it causes a cascading render: the component renders,
 * the effect immediately renders it again with "loading", and only then does
 * the fetch start.
 *
 * The initial state is ALREADY loading, so that first synchronous write was
 * always redundant. Retrying is different — it happens in an event handler,
 * where setState is exactly right — so the two paths are separated instead of
 * sharing a function that has to be correct in both. `reloadToken` is what the
 * effect watches; the handler bumps it and sets the loading state itself.
 */

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: T };

export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): [Resource<T>, () => void] {
  const [state, setState] = useState<Resource<T>>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    fetcher(controller.signal)
      .then((data) => {
        if (live) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        // An abort is this component unmounting, not a failure to report.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (live) setState({ status: 'error', error });
      });

    return () => {
      // `live` as well as the abort: a resolved promise can still be scheduled
      // when the controller aborts, and setting state on an unmounted
      // component is the classic React warning.
      live = false;
      controller.abort();
    };
    // The fetcher is expected to be a closure over `deps`; taking it as a
    // dependency would re-run on every render, since callers write it inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const reload = useCallback(() => {
    // In an event handler, which is where setState belongs.
    setState({ status: 'loading' });
    setReloadToken((n) => n + 1);
  }, []);

  return [state, reload];
}
