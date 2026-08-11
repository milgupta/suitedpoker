/**
 * Re-export seat activity from the poker engine.
 *
 * The implementation lives in `src/poker/seat-activity.ts` so `generateSpot`
 * can enrich seats without importing from `src/lib`. Call sites outside the
 * engine keep this path.
 */

export {
  PREFLOP_ORDER,
  committedBbOf,
  parseActionBb,
  seatActivity,
  type SeatActivity,
} from "@/poker/seat-activity";
