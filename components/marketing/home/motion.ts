/**
 * Motion helpers with no React in them, and deliberately NO "use client".
 *
 * `stagger` lives here rather than in primitives.tsx because most of the homepage
 * sections are server components. Anything exported from a "use client" module is a
 * client-boundary reference, so calling it during a server render fails with
 * "Attempted to call stagger() from the server". A plain module has no boundary and is
 * callable from both sides.
 */

/**
 * An inline `transition-delay`, so a stagger reads as data at the call site rather than
 * as a magic number in a class name.
 *
 * Pairs with the `.wa-lift` / `.wa-pop` / `.wa-grow-x` classes in app/globals.css: those
 * hold the resting state and transition, this decides when each sibling starts.
 *
 * @param index - Position in the list being staggered.
 * @param step  - Milliseconds between neighbours.
 * @param base  - Milliseconds before the first one starts.
 */
export function stagger(index: number, step = 70, base = 0) {
  return { transitionDelay: `${base + index * step}ms` };
}
