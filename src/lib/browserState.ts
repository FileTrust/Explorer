'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Reading things the browser owns, without an effect that writes state.
 *
 * Three screens' worth of code read the URL or `localStorage` inside a
 * `useEffect` and then called `setState` with what they found. That works, and
 * it is a render too late every time: the first paint shows the default, the
 * effect runs, and everything renders again. React flags it because a cascade
 * like that is easy to write and hard to see, and because both of these are
 * *external stores* -- there is an API for exactly this shape, and it handles
 * the server render, which the effect version papered over with a `ready` flag.
 *
 * `useSyncExternalStore` wants three things: how to subscribe, what the value is
 * now, and what it is when there is no browser. The third is what makes these
 * safe to render on the server.
 */

/** Subscribers, so a write in one component reaches every reader of that key. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // `storage` fires only in *other* tabs, which is exactly the case a local
  // notification cannot cover.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

/**
 * A boolean remembered in `localStorage`.
 *
 * Returns the fallback during server rendering and on the first client render,
 * so the two agree; the real value arrives on the store's first notification.
 * That is the same behaviour the `ready` flag was written to get, minus the
 * flag, the second state variable, and the two effects around it.
 */
export function usePersistentFlag(
  key: string,
  // A function when the default has to be asked for rather than assumed -- the
  // theme falls back to what the operating system prefers, which only the
  // browser can answer, so the server render uses `false` and the client's
  // first read supplies the real one.
  fallback: boolean | (() => boolean) = false,
  // How to read a value someone else wrote. The theme was stored as the words
  // "dark" and "light" long before it was a flag, and a reader who had chosen
  // light would have been flipped back to dark by a stricter parse -- silently,
  // because a wrong theme looks exactly like a theme.
  parse: (raw: string) => boolean = (raw) => raw === '1',
): [boolean, (next: boolean | ((current: boolean) => boolean)) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) return parse(saved);
      return typeof fallback === 'function' ? fallback() : fallback;
    },
    () => (typeof fallback === 'function' ? false : fallback),
  );

  const set = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    const saved = window.localStorage.getItem(key);
    const current = saved !== null
      ? parse(saved)
      : (typeof fallback === 'function' ? fallback() : fallback);
    const resolved = typeof next === 'function' ? next(current) : next;
    window.localStorage.setItem(key, resolved ? '1' : '0');
    notify();
  }, [key, fallback, parse]);

  return [value, set];
}

/**
 * The initial value of a query parameter, for a screen that seeds a filter box
 * from a link.
 *
 * Deliberately a *starting* value and not a subscription: the box is the user's
 * once they type in it, and having the URL keep overwriting what they typed is
 * a worse bug than the one this replaces. Reading `window.location` rather than
 * `useSearchParams` keeps these pages out of a Suspense boundary they do not
 * otherwise need -- they render a loading state first, so the input this feeds
 * does not exist during the server render and cannot mismatch it.
 */
export function initialQueryParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

/**
 * The current time, as chain seconds, refreshed on a timer.
 *
 * Three screens read `Date.now()` in the middle of render to decide whether a
 * heartbeat was recent or a suspension has lapsed. That makes render
 * non-deterministic -- two renders of the same data can disagree -- which React
 * flags, and it is also wrong in a quieter way: the answer only changed when
 * something else happened to re-render, so "last seen 2 minutes ago" could sit
 * there saying 2 minutes for an hour.
 *
 * A tick in state fixes both. The interval is coarse because every consumer is
 * rendering a relative time or comparing against a deadline, and neither needs
 * to be right to the second.
 */
export function useNowSeconds(intervalMs = 15_000): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));

  useEffect(() => {
    const id = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
