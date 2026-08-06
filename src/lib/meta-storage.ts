/**
 * Where the Purchase dedup id waits out the Stripe redirect.
 *
 * localStorage rather than a cookie: it never needs to reach the server (the
 * server gets its copy through Stripe metadata), and keeping it out of the
 * request headers keeps it off every unrelated request for 30 days.
 */
export const PURCHASE_EVENT_ID_KEY = "sp_purchase_event_id";
