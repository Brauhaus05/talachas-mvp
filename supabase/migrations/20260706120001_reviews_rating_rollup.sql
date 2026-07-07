-- Phase 6 · Reviews rating rollup.
-- rating_avg / rating_count on talachero_profiles are derived from real review
-- rows (previously hand-set in the seed, decoupled from reviews). This trigger
-- recomputes them for the affected target on every review INSERT/DELETE, so the
-- directory rating always matches the underlying reviews. Fires on DELETE too,
-- so the Phase 6 admin "delete review" action (cycle 2) fixes the rollup for free.
-- SECURITY DEFINER: writes talachero_profiles money-adjacent aggregate columns.

create or replace function public.recompute_talachero_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := coalesce(new.target_id, old.target_id);
begin
  update talachero_profiles p
  set
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2)
                             from reviews r where r.target_id = v_target), 0),
    rating_count = (select count(*) from reviews r where r.target_id = v_target)
  where p.user_id = v_target;
  return null; -- AFTER trigger: return value ignored
end;
$$;

drop trigger if exists reviews_rating_rollup on public.reviews;
create trigger reviews_rating_rollup
  after insert or delete on public.reviews
  for each row execute function public.recompute_talachero_rating();

-- Lock down the derived aggregate columns: only the rollup trigger (SECURITY
-- DEFINER, runs as owner → bypasses column grants) may write them. Prevents a
-- talachero from spoofing their own rating via a direct authenticated update,
-- matching the repo pattern for protected columns (bookings money cols, users.role).
revoke update (rating_avg, rating_count) on public.talachero_profiles from authenticated;
