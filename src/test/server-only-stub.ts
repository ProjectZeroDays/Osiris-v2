// Stand-in for the `server-only` package under Vitest.
//
// The real package throws when imported outside a React Server Component
// graph. The integration modules use it as a guard against client-side
// imports; under test the guard is the alias itself, so this file is empty
// on purpose and must stay that way.
export {};
