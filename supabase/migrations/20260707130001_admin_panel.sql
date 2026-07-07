-- Phase 6 cycle 2 · Admin panel RPCs.
-- Every admin mutation is a SECURITY DEFINER function that self-validates
-- is_admin() (mirrors create_booking / create_review). Reads are curated
-- projections because party names sit behind users own-row RLS.

-- ---- Ban / unban -----------------------------------------------------------
-- Writes auth.users.banned_until; GoTrue rejects sign-in + token refresh while
-- banned_until > now(). Runs as owner (postgres), which may write auth.users.
create or replace function public.admin_set_ban(p_user_id uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  select role into v_role from public.users where id = p_user_id;
  if not found then
    raise exception 'user_not_found';
  end if;
  -- Never ban an admin (covers self-ban).
  if p_banned and v_role = 'admin' then
    raise exception 'cannot_ban_admin';
  end if;
  update auth.users
     set banned_until = case when p_banned then 'infinity'::timestamptz else null end
   where id = p_user_id;
end;
$$;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;

-- ---- Delete review ---------------------------------------------------------
-- reviews DELETE is not granted to authenticated and has no policy; this RPC is
-- the only path. The reviews_rating_rollup AFTER DELETE trigger recomputes the
-- talachero's rating_avg / rating_count.
create or replace function public.admin_delete_review(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  if not exists (select 1 from reviews where id = p_review_id) then
    raise exception 'review_not_found';
  end if;
  delete from reviews where id = p_review_id;
end;
$$;
grant execute on function public.admin_delete_review(uuid) to authenticated;

-- ---- Reads (curated projections) -------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, role public.user_role, banned boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  return query
    select u.id, u.email, u.full_name, u.role,
           (au.banned_until is not null and au.banned_until > now()) as banned
      from public.users u
      join auth.users au on au.id = u.id
     order by u.role, u.email;
end;
$$;
grant execute on function public.admin_list_users() to authenticated;

-- Refundable set = captured payments (capture happens at completion).
create or replace function public.admin_list_bookings()
returns table (
  id uuid, client_name text, talachero_name text,
  price numeric, currency text, payment_status text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  return query
    select b.id, cu.full_name, tu.full_name,
           b.price, b.currency, b.payment_status, b.created_at
      from bookings b
      join users cu on cu.id = b.client_id
      join talachero_profiles tp on tp.id = b.talachero_id
      join users tu on tu.id = tp.user_id
     where b.payment_status = 'captured'
     order by b.created_at desc;
end;
$$;
grant execute on function public.admin_list_bookings() to authenticated;

create or replace function public.admin_list_reviews()
returns table (
  id uuid, author_name text, target_name text,
  rating integer, comment text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  return query
    select r.id, au.full_name, tu.full_name, r.rating, r.comment, r.created_at
      from reviews r
      join users au on au.id = r.author_id
      join users tu on tu.id = r.target_id
     order by r.created_at desc;
end;
$$;
grant execute on function public.admin_list_reviews() to authenticated;
