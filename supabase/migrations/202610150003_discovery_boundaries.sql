-- The recipient's discovery consent must apply to direct API/media access too.
-- A viewer may widen their own search filters, but cannot override another person's preferences.
create function private.accepts_viewer(viewer uuid,recipient uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles owner join public.profiles v on v.id=viewer join private.accounts a on a.id=v.id where owner.id=recipient and (owner.seeking='everyone' or owner.seeking=v.gender) and extract(year from age(a.dob)) between owner.min_age and owner.max_age)
$$;
revoke all on function private.accepts_viewer(uuid,uuid) from public,anon,authenticated;
create or replace function private.can_view(who uuid) returns boolean language sql stable security definer set search_path='' as $$
 select who=auth.uid() or (
  private.active_user(auth.uid()) and private.active_user(who) and not private.blocked(auth.uid(),who)
  and ((private.complete_profile(auth.uid()) and private.complete_profile(who) and private.accepts_viewer(auth.uid(),who) and exists(select 1 from public.profiles where id=who and not paused))
    or exists(select 1 from public.matches m where auth.uid() in(m.a,m.b) and who in(m.a,m.b)))
 )
$$;

create or replace function public.swipe(target_id uuid,choice text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=private.require_active();mid uuid;first_id uuid;second_id uuid;
begin
 perform private.rate('swipe',150,3600);
 if choice not in ('like','pass') or who=target_id then raise exception 'Invalid choice';end if;
 first_id:=least(who,target_id);second_id:=greatest(who,target_id);
 -- A transaction-scoped pair lock serialises concurrent reciprocal likes and blocks.
 perform pg_advisory_xact_lock(hashtextextended(first_id::text||second_id::text,0));
 if not private.complete_profile(who) or not private.complete_profile(target_id) or not private.active_user(target_id) or private.blocked(who,target_id) or not private.accepts_viewer(who,target_id) or not exists(select 1 from public.profiles where id=target_id and not paused) then raise exception 'Profile unavailable' using errcode='42501';end if;
 insert into public.likes(actor,target,decision) values(who,target_id,choice) on conflict(actor,target) do update set decision=excluded.decision;
 if choice='like' and exists(select 1 from public.likes where actor=target_id and target=who and decision='like') then
  insert into public.matches(a,b) values(first_id,second_id) on conflict(a,b) do nothing;
  select id into mid from public.matches where a=first_id and b=second_id;
 end if;
 return jsonb_build_object('match_id',mid);
end $$;
