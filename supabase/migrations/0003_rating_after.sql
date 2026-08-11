-- The user's rating after each graded drill attempt.
--
-- The progress screen's 30-day sparkline was a synthetic flat line: no rating
-- history was ever stored, so the chart repeated the current rating for all 30
-- days and the "last session" delta was hardcoded zero. The answer route knows
-- the post-attempt rating at grade time; storing it makes the chart real going
-- forward. Null for attempts that predate the column and for daily-challenge
-- attempts, which do not move the rating.
alter table drill_attempts
  add column if not exists rating_after integer;
