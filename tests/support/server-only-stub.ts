/**
 * Stub for the `server-only` package under Vitest.
 *
 * `server-only` deliberately throws when it is resolved outside a React Server
 * Component, which is exactly what makes it a useful guard in src/lib — and
 * exactly what stops a Node test importing those modules. Aliasing it away in
 * the test config keeps the guard real in the app and inert in tests.
 */
export {};
