-- "Claim this store": on a brand-new installation, the first person who logs in can make
-- themselves the admin from the app. Once any admin exists, claiming is closed for good
-- (further staff are added by an admin in Admin -> Staff & roles).

create or replace function public.store_has_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;

create or replace function public.claim_store_ownership()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- serialise claims so two people clicking at the same moment can't both become admin
  perform pg_advisory_xact_lock(hashtext('claim_store_ownership'));
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'STORE_ALREADY_CLAIMED';
  end if;
  update public.profiles set role = 'admin' where id = auth.uid() and not is_blocked;
  if not found then raise exception 'NOT_AUTHENTICATED'; end if;
end $$;

revoke execute on function public.store_has_admin() from public;
revoke execute on function public.claim_store_ownership() from public, anon;
grant execute on function public.store_has_admin() to anon, authenticated;
grant execute on function public.claim_store_ownership() to authenticated;
