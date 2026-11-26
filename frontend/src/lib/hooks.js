import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** Fetch JSON from the API with loading/error state and a reload() helper. */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) { setState({ data: null, error: null, loading: false }); return undefined; }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path, { signal: ctrl.signal })
      .then((data) => { if (!ctrl.signal.aborted) setState({ data, error: null, loading: false }); })
      .catch((error) => { if (!ctrl.signal.aborted && error.name !== 'AbortError') setState({ data: null, error, loading: false }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((data) => setState((s) => ({ ...s, data })), []);
  return { ...state, reload, setData };
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ShackPulse` : 'ShackPulse — projects at DevOps Shack';
  }, [title]);
}
