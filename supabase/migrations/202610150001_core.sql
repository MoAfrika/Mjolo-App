create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.accounts (
 id uuid primary key references auth.users on delete cascade,
 dob date, role text not null default 'user' check(role in ('user','admin')),
 status text not null default 'active' check(status in ('active','suspended')),
 must_change_password boolean not null default false,
 check(dob is null or dob <= current_date - interval '18 years')
);
create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9_.]{3,30}$'),
 display_name text not null default '', bio text not null default '' check(length(bio)<=1000),
 gender text not null default '' check(gender in ('','woman','man','nonbinary')),
 seeking text not null default 'everyone' check(seeking in ('woman','man','nonbinary','everyone')),
 province text not null default '' check(province in ('','Gauteng','Western Cape','KwaZulu-Natal','Eastern Cape','Free State','Limpopo','Mpumalanga','North West','Northern Cape')),
 city text not null default '', area text not null default '',
 intentions text not null default 'A lasting relationship' check(intentions in ('A lasting relationship','Dating with intention','Exploring connections')),
 interests text[] not null default '{}', languages text[] not null default '{English}',
 min_age int not null default 18 check(min_age between 18 and 110),max_age int not null default 80 check(max_age between min_age and 110),
 budget_min int not null default 0 check(budget_min between 0 and 100000),budget_max int not null default 500 check(budget_max between budget_min and 100000),
 availability text not null default 'Weekends' check(availability in ('Weekends','Weekday evenings','Flexible')),
 paused boolean not null default false,show_area boolean not null default true,low_data boolean not null default false,
 quiet_start int not null default 22 check(quiet_start between 0 and 23),quiet_end int not null default 8 check(quiet_end between 0 and 23),
 reminders boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.photos(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,path text not null unique,created_at timestamptz not null default now());
create table public.likes(actor uuid not null references public.profiles on delete cascade,target uuid not null references public.profiles on delete cascade,decision text not null check(decision in ('like','pass')),created_at timestamptz not null default now(),primary key(actor,target),check(actor<>target));
create table public.matches(id uuid primary key default gen_random_uuid(),a uuid not null references public.profiles on delete cascade,b uuid not null references public.profiles on delete cascade,created_at timestamptz not null default now(),unique(a,b),check(a<b));
create table public.messages(id uuid primary key default gen_random_uuid(),match_id uuid not null references public.matches on delete cascade,sender uuid not null references public.profiles on delete cascade,body text not null check(length(body) between 1 and 2000),client_id uuid not null,created_at timestamptz not null default now(),unique(sender,client_id));
create index messages_match_time on public.messages(match_id,created_at);
create table public.date_plans(id uuid primary key default gen_random_uuid(),match_id uuid not null references public.matches on delete cascade,proposer uuid not null references public.profiles on delete cascade,venue text not null check(length(venue) between 3 and 200),area text not null check(length(area) between 2 and 100),scheduled_at timestamptz not null,budget_zar int not null check(budget_zar between 0 and 100000),note text not null default '' check(length(note)<=1000),status text not null default 'proposed' check(status in ('proposed','accepted','cancelled')),version int not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.blocks(actor uuid not null references public.profiles on delete cascade,target uuid not null references public.profiles on delete cascade,created_at timestamptz not null default now(),primary key(actor,target),check(actor<>target));
create table public.reports(id uuid primary key default gen_random_uuid(),reporter uuid references public.profiles on delete set null,target uuid references public.profiles on delete set null,reason text not null check(reason in ('harassment','underage','impersonation','scam','unsafe','other')),details text not null check(length(details) between 10 and 2000),status text not null default 'open' check(status in ('open','resolved')),created_at timestamptz not null default now());
create table private.audit(id bigint generated always as identity primary key,actor uuid,action text not null,target uuid,created_at timestamptz not null default now());
create table private.rate_limits(actor uuid not null references auth.users on delete cascade,action text not null,bucket bigint not null,n int not null,primary key(actor,action,bucket));

create function private.bootstrap_user() returns trigger language plpgsql security definer set search_path='' as $$
declare d date; name text; admin_bootstrap boolean := coalesce((new.raw_app_meta_data->>'provisioned_admin')::boolean,false);
begin
 name:=lower(new.raw_user_meta_data->>'username');
 if name is null or name !~ '^[a-z0-9_.]{3,30}$' then raise exception 'Valid username required'; end if;
 if name='skotch.ntilane' and not admin_bootstrap then raise exception 'Reserved username';end if;
 if not admin_bootstrap then
  if coalesce(new.raw_user_meta_data->>'adult_consent','false')<>'true' or coalesce(new.raw_user_meta_data->>'terms_consent','false')<>'true' then raise exception 'Adult and terms consent required';end if;
  d:=(new.raw_user_meta_data->>'dob')::date;
  if d is null or d>current_date-interval '18 years' or d<current_date-interval '110 years' then raise exception 'You must be 18 or older';end if;
 end if;
 insert into private.accounts(id,dob,must_change_password) values(new.id,d,admin_bootstrap);
 insert into public.profiles(id,username) values(new.id,name);
 insert into private.audit(actor,action,target) values(new.id,'account.registered',new.id);
 return new;
end $$;
create trigger mjolo_new_user after insert on auth.users for each row execute function private.bootstrap_user();
create function private.password_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.encrypted_password is distinct from new.encrypted_password then
  update private.accounts set must_change_password=false where id=new.id;
  insert into private.audit(actor,action,target) values(new.id,'password.changed',new.id);
 end if;return new;
end $$;
create trigger mjolo_password_changed after update of encrypted_password on auth.users for each row execute function private.password_changed();

create function private.active_user(who uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.accounts a join auth.users u on u.id=a.id where a.id=who and a.status='active' and not a.must_change_password and u.email_confirmed_at is not null and (who<>auth.uid() or exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=who)));
$$;
create function private.require_active() returns uuid language plpgsql stable security definer set search_path='' as $$
begin if auth.uid() is null or not private.active_user(auth.uid()) then raise exception 'Verify your email, change any initial password, and log in to an active account' using errcode='42501';end if;return auth.uid();end $$;
create function private.blocked(x uuid,y uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.blocks where (actor=x and target=y) or (actor=y and target=x))$$;
create function private.complete_profile(who uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p join private.accounts a on a.id=p.id where p.id=who and a.dob is not null and a.dob<=current_date-interval '18 years' and length(p.display_name)>=2 and length(p.bio)>=20 and p.gender<>'' and p.province<>'' and length(p.city)>=2 and exists(select 1 from public.photos f where f.user_id=who))$$;
create function private.can_match(mid uuid) returns boolean language sql stable security definer set search_path='' as $$select private.active_user(auth.uid()) and exists(select 1 from public.matches m where m.id=mid and auth.uid() in (m.a,m.b) and not private.blocked(m.a,m.b) and private.active_user(m.a) and private.active_user(m.b))$$;
create function private.can_view(who uuid) returns boolean language sql stable security definer set search_path='' as $$select who=auth.uid() or (private.active_user(auth.uid()) and private.active_user(who) and not private.blocked(auth.uid(),who) and ((private.complete_profile(auth.uid()) and private.complete_profile(who) and exists(select 1 from public.profiles where id=who and not paused)) or exists(select 1 from public.matches m where auth.uid() in(m.a,m.b) and who in(m.a,m.b))))$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select private.active_user(auth.uid()) and exists(select 1 from private.accounts where id=auth.uid() and role='admin')$$;
create function private.rate(action_name text,max_requests int,seconds int) returns void language plpgsql security definer set search_path='' as $$
declare count_now int;
begin
 insert into private.rate_limits(actor,action,bucket,n) values(auth.uid(),action_name,floor(extract(epoch from now())/seconds),1) on conflict(actor,action,bucket) do update set n=private.rate_limits.n+1 returning n into count_now;
 if count_now>max_requests then raise exception 'Rate limit exceeded. Try again later.' using errcode='54000';end if;
 delete from private.rate_limits where actor=auth.uid() and bucket<floor(extract(epoch from now())/seconds)-10000;
end $$;
create function private.profile_json(who uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'bio',p.bio,'gender',p.gender,'seeking',p.seeking,'province',p.province,'city',case when p.show_area or who=auth.uid() then p.city else '' end,'area',case when p.show_area or who=auth.uid() then p.area else '' end,'age',extract(year from age(a.dob))::int,'intentions',p.intentions,'interests',p.interests,'languages',p.languages,'budget_min',p.budget_min,'budget_max',p.budget_max,'availability',p.availability,'photos',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'path',f.path) order by f.created_at) from public.photos f where f.user_id=who),'[]'::jsonb)) from public.profiles p join private.accounts a on a.id=p.id where p.id=who
$$;

alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.likes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.date_plans enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
-- Access helpers are exposed only for evaluation by RLS, not REST RPC (private schema).
grant usage on schema private to authenticated;
grant execute on function private.active_user(uuid),private.blocked(uuid,uuid),private.complete_profile(uuid),private.can_match(uuid),private.can_view(uuid),private.is_admin() to authenticated;
revoke all on all tables in schema private from anon,authenticated;
revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.photos,public.likes,public.matches,public.messages,public.date_plans,public.blocks,public.reports to authenticated;
create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());
-- Other profiles are returned via discovery and match RPCs to avoid leaking privacy preferences.
create policy photos_visible on public.photos for select to authenticated using(private.can_view(user_id));
create policy likes_self on public.likes for select to authenticated using(private.active_user(auth.uid()) and actor=auth.uid() and not private.blocked(actor,target));
create policy matches_members on public.matches for select to authenticated using(private.can_match(id));
create policy messages_members on public.messages for select to authenticated using(private.can_match(match_id));
create policy dates_members on public.date_plans for select to authenticated using(private.can_match(match_id));
create policy blocks_self on public.blocks for select to authenticated using(actor=auth.uid() and private.active_user(auth.uid()));
create policy reports_admin on public.reports for select to authenticated using(private.is_admin());

create function public.get_me() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 select to_jsonb(p)||jsonb_build_object('dob',a.dob,'role',a.role,'status',a.status,'must_change_password',a.must_change_password,'verified',u.email_confirmed_at is not null,'complete',private.complete_profile(p.id),'photos',coalesce((select jsonb_agg(to_jsonb(f)) from public.photos f where f.user_id=p.id),'[]'::jsonb)) into result from public.profiles p join private.accounts a on a.id=p.id join auth.users u on u.id=p.id where p.id=auth.uid();return result;
end $$;
create function public.save_profile(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=private.require_active();d date;old_d date;ints text[];langs text[];
begin
 perform private.rate('profile',30,3600);
 d:=(input->>'dob')::date;select dob into old_d from private.accounts where id=who;
 if d is null or d>current_date-interval '18 years' or d<current_date-interval '110 years' or (old_d is not null and d<>old_d) then raise exception 'Valid adult birth date is required and cannot be changed';end if;
 if length(trim(input->>'display_name')) not between 2 and 60 or length(trim(input->>'bio')) not between 20 and 1000 or length(trim(input->>'city')) not between 2 and 80 or length(input->>'area')>100 then raise exception 'Please complete your name, city and a 20–1000 character bio';end if;
 if input->>'gender' not in ('woman','man','nonbinary') or input->>'province' not in ('Gauteng','Western Cape','KwaZulu-Natal','Eastern Cape','Free State','Limpopo','Mpumalanga','North West','Northern Cape') then raise exception 'Choose a valid gender and province';end if;
 select array_agg(trim(value)) into ints from jsonb_array_elements_text(input->'interests');select array_agg(trim(value)) into langs from jsonb_array_elements_text(input->'languages');
 if coalesce(array_length(ints,1),0)>12 or coalesce(array_length(langs,1),0) not between 1 and 12 or exists(select 1 from unnest(ints||langs) v where length(v)>40 or length(v)<1) then raise exception 'Use up to 12 interests and languages, 1–40 characters each';end if;
 update private.accounts set dob=d where id=who;
 update public.profiles set display_name=trim(input->>'display_name'),bio=trim(input->>'bio'),gender=input->>'gender',seeking=input->>'seeking',province=input->>'province',city=trim(input->>'city'),area=coalesce(trim(input->>'area'),''),intentions=input->>'intentions',interests=coalesce(ints,'{}'),languages=langs,min_age=(input->>'min_age')::int,max_age=(input->>'max_age')::int,budget_min=(input->>'budget_min')::int,budget_max=(input->>'budget_max')::int,availability=input->>'availability',paused=(input->>'paused')::boolean,show_area=(input->>'show_area')::boolean,low_data=(input->>'low_data')::boolean,quiet_start=(input->>'quiet_start')::int,quiet_end=(input->>'quiet_end')::int,reminders=(input->>'reminders')::boolean,updated_at=now() where id=who;
 return public.get_me();
end $$;
create function public.discover(filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare who uuid:=private.require_active();mine public.profiles;result jsonb;minage int;maxage int;
begin
 if not private.complete_profile(who) then raise exception 'Complete your profile and upload a photo first';end if;select * into mine from public.profiles where id=who;
 minage:=coalesce((filters->>'min_age')::int,mine.min_age);maxage:=coalesce((filters->>'max_age')::int,mine.max_age);
 if minage<18 or maxage>110 or maxage<minage then raise exception 'Invalid age range';end if;
 select coalesce(jsonb_agg(private.profile_json(t.id)),'[]'::jsonb) into result from (
 select p.id from public.profiles p join private.accounts a on a.id=p.id where p.id<>who and not p.paused and private.active_user(p.id) and private.complete_profile(p.id) and not private.blocked(who,p.id)
 and extract(year from age(a.dob)) between minage and maxage
 and (coalesce(nullif(filters->>'gender',''),mine.seeking)='everyone' or p.gender=coalesce(nullif(filters->>'gender',''),mine.seeking))
 and (p.seeking='everyone' or p.seeking=mine.gender)
 and (select extract(year from age(dob)) from private.accounts where id=who) between p.min_age and p.max_age
 and (coalesce(filters->>'province','')='' or p.province=filters->>'province')
 and (coalesce(filters->>'city','')='' or (p.show_area and lower(p.city)=lower(filters->>'city')))
 and (coalesce(filters->>'area','')='' or (p.show_area and lower(p.area)=lower(filters->>'area')))
 and (coalesce(filters->>'intentions','')='' or p.intentions=filters->>'intentions')
 and not exists(select 1 from public.likes l where l.actor=who and l.target=p.id)
 and not exists(select 1 from public.matches m where who in(m.a,m.b) and p.id in(m.a,m.b))
 order by p.updated_at desc limit 50) t;return result;
end $$;
create function public.swipe(target_id uuid,choice text) returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=private.require_active();mid uuid;first_id uuid;second_id uuid;
begin
 perform private.rate('swipe',150,3600);
 if choice not in ('like','pass') or who=target_id then raise exception 'Invalid choice';end if;
 first_id:=least(who,target_id);second_id:=greatest(who,target_id);
 -- A transaction-scoped pair lock serialises concurrent reciprocal likes and blocks.
 perform pg_advisory_xact_lock(hashtextextended(first_id::text||second_id::text,0));
 if not private.complete_profile(who) or not private.complete_profile(target_id) or not private.active_user(target_id) or private.blocked(who,target_id) or not exists(select 1 from public.profiles where id=target_id and not paused) then raise exception 'Profile unavailable' using errcode='42501';end if;
 insert into public.likes(actor,target,decision) values(who,target_id,choice) on conflict(actor,target) do update set decision=excluded.decision;
 if choice='like' and exists(select 1 from public.likes where actor=target_id and target=who and decision='like') then
  insert into public.matches(a,b) values(first_id,second_id) on conflict(a,b) do nothing;
  select id into mid from public.matches where a=first_id and b=second_id;
 end if;
 return jsonb_build_object('match_id',mid);
end $$;
create function public.my_matches() returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'created_at',m.created_at,'profile',private.profile_json(case when m.a=auth.uid() then m.b else m.a end)) order by m.created_at desc),'[]'::jsonb) from public.matches m where private.can_match(m.id)$$;
create function public.my_likes() returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(private.profile_json(l.target) order by l.created_at desc),'[]'::jsonb) from public.likes l where l.actor=auth.uid() and l.decision='like' and private.active_user(auth.uid()) and private.can_view(l.target)$$;
create function public.send_message(conversation_id uuid,content text,request_id uuid) returns public.messages language plpgsql security definer set search_path='' as $$
declare who uuid:=private.require_active();m public.matches;result public.messages;
begin
 select * into m from public.matches where id=conversation_id;
 if m.id is null then raise exception 'Conversation unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(m.a::text||m.b::text,0));
 if not private.can_match(conversation_id) then raise exception 'Conversation unavailable' using errcode='42501';end if;
 select * into result from public.messages where sender=who and client_id=request_id;
 if result.id is not null then if result.match_id<>conversation_id or result.body<>trim(content) then raise exception 'Request ID already used';end if;return result;end if;
 perform private.rate('message',40,60);
 insert into public.messages(match_id,sender,body,client_id) values(conversation_id,who,trim(content),request_id) returning * into result;return result;
end $$;
create function public.propose_date(conversation_id uuid,input jsonb) returns public.date_plans language plpgsql security definer set search_path='' as $$
declare who uuid:=private.require_active();result public.date_plans;m public.matches;
begin
 select * into m from public.matches where id=conversation_id;
 if m.id is null then raise exception 'Conversation unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(m.a::text||m.b::text,0));
 if not private.can_match(conversation_id) then raise exception 'Conversation unavailable' using errcode='42501';end if;
 perform private.rate('date',20,3600);
 if (input->>'scheduled_at')::timestamptz<=now()+interval '1 minute' or (input->>'scheduled_at')::timestamptz>now()+interval '1 year' then raise exception 'Choose a future date within one year';end if;
 insert into public.date_plans(match_id,proposer,venue,area,scheduled_at,budget_zar,note) values(conversation_id,who,trim(input->>'venue'),trim(input->>'area'),(input->>'scheduled_at')::timestamptz,(input->>'budget_zar')::int,coalesce(input->>'note','')) returning * into result;return result;
end $$;
create function public.change_date(plan_id uuid,expected_version int,action text,input jsonb default '{}') returns public.date_plans language plpgsql security definer set search_path='' as $$
declare who uuid:=private.require_active();d public.date_plans;m public.matches;
begin
 select * into d from public.date_plans where id=plan_id;
 select * into m from public.matches where id=d.match_id;
 if m.id is null then raise exception 'Date unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(m.a::text||m.b::text,0));
 select * into d from public.date_plans where id=plan_id for update;
 if not private.can_match(d.match_id) then raise exception 'Date unavailable' using errcode='42501';end if;
 if d.version<>expected_version or d.status='cancelled' then raise exception 'Date changed or cancelled. Refresh first';end if;
 perform private.rate('date',20,3600);
 if action='accept' then
  if d.proposer=who or d.status<>'proposed' or d.scheduled_at<=now() then raise exception 'Only the recipient can accept a future proposal' using errcode='42501';end if;
  update public.date_plans set status='accepted',version=version+1,updated_at=now() where id=plan_id returning * into d;
 elsif action='cancel' then update public.date_plans set status='cancelled',version=version+1,updated_at=now() where id=plan_id returning * into d;
 elsif action='update' then
  if (input->>'scheduled_at')::timestamptz<=now()+interval '1 minute' or (input->>'scheduled_at')::timestamptz>now()+interval '1 year' then raise exception 'Choose a future date within one year';end if;
  update public.date_plans set venue=trim(input->>'venue'),area=trim(input->>'area'),scheduled_at=(input->>'scheduled_at')::timestamptz,budget_zar=(input->>'budget_zar')::int,note=coalesce(input->>'note',''),proposer=who,status='proposed',version=version+1,updated_at=now() where id=plan_id returning * into d;
 else raise exception 'Invalid action';end if;return d;
end $$;
create function public.block_user(target_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare who uuid:=private.require_active();first_id uuid:=least(who,target_id);second_id uuid:=greatest(who,target_id);
begin
 perform private.rate('block',30,3600);if who=target_id then raise exception 'Cannot block yourself';end if;
 perform pg_advisory_xact_lock(hashtextextended(first_id::text||second_id::text,0));
 insert into public.blocks(actor,target) values(who,target_id) on conflict do nothing;
 delete from public.likes where (actor=who and target=target_id) or (actor=target_id and target=who);
 -- Remove the match and its messages/dates. Unblocking never restores prior conversations.
 delete from public.matches where public.matches.a=first_id and public.matches.b=second_id;
 insert into private.audit(actor,action,target) values(who,'user.blocked',target_id);
end $$;
create function public.unblock_user(target_id uuid) returns void language plpgsql security definer set search_path='' as $$begin perform private.require_active();delete from public.blocks where actor=auth.uid() and target=target_id;end $$;
create function public.report_user(target_id uuid,reason_text text,detail_text text) returns uuid language plpgsql security definer set search_path='' as $$declare who uuid:=private.require_active();rid uuid;begin perform private.rate('report',10,3600);if who=target_id then raise exception 'Invalid target';end if;insert into public.reports(reporter,target,reason,details) values(who,target_id,reason_text,trim(detail_text)) returning id into rid;return rid;end $$;
create function public.moderate(report_id uuid,new_status text,user_status text default null) returns void language plpgsql security definer set search_path='' as $$
declare target_id uuid;
begin
 if not private.is_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 select target into target_id from public.reports where id=report_id;
 if not found then raise exception 'Report not found';end if;
 update public.reports set status=new_status where id=report_id;
 if user_status is not null then
  if exists(select 1 from private.accounts where id=target_id and role='admin') then raise exception 'Cannot moderate administrator accounts';end if;
  update private.accounts set status=user_status where id=target_id;
  if user_status='suspended' then delete from auth.sessions where user_id=target_id;end if;
 end if;
 insert into private.audit(actor,action,target) values(auth.uid(),'report.'||new_status||coalesce('.'||user_status,''),target_id);
end $$;
create function public.admin_audit() returns jsonb language plpgsql stable security definer set search_path='' as $$begin if not private.is_admin() then raise exception 'Administrator access required' using errcode='42501';end if;return (select coalesce(jsonb_agg(t),'[]'::jsonb) from (select * from private.audit order by id desc limit 200)t);end $$;
-- Only the controlled server-side service role may assign this role.
create function public.provision_administrator(user_id uuid) returns void language plpgsql security definer set search_path='' as $$begin if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=user_id and lower(u.email)='skotch.ntilane@gmail.com' and p.username='skotch.ntilane') then raise exception 'Administrator identity mismatch';end if;update private.accounts set role='admin',must_change_password=true where id=user_id;insert into private.audit(actor,action,target) values(user_id,'admin.provisioned',user_id);end $$;
create function public.reserve_upload() returns uuid language plpgsql security definer set search_path='' as $$declare who uuid:=private.require_active();begin perform private.rate('upload',20,3600);if (select count(*) from public.photos where user_id=who)>=6 then raise exception 'Maximum six photos';end if;return gen_random_uuid();end $$;
create function public.finish_upload(photo_id uuid,object_path text) returns void language plpgsql security definer set search_path='' as $$declare who uuid:=private.require_active();begin perform pg_advisory_xact_lock(hashtextextended(who::text,1));if object_path<>who::text||'/'||photo_id::text||'.jpg' or not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=object_path) then raise exception 'Invalid uploaded photo';end if;if (select count(*) from public.photos where user_id=who)>=6 then raise exception 'Maximum six photos';end if;insert into public.photos(id,user_id,path) values(photo_id,who,object_path);end $$;
create function public.delete_photo(photo_id uuid) returns text language plpgsql security definer set search_path='' as $$declare path_to_delete text;begin perform private.require_active();delete from public.photos where id=photo_id and user_id=auth.uid() returning path into path_to_delete;if path_to_delete is null then raise exception 'Photo not found';end if;return path_to_delete;end $$;
create function public.export_account() returns jsonb language plpgsql stable security definer set search_path='' as $$begin perform private.require_active();return jsonb_build_object('profile',public.get_me(),'likes',(select coalesce(jsonb_agg(l),'[]') from public.likes l where actor=auth.uid()),'messages',(select coalesce(jsonb_agg(m),'[]') from public.messages m where sender=auth.uid()),'dates',(select coalesce(jsonb_agg(d),'[]') from public.date_plans d where private.can_match(match_id)),'reports',(select coalesce(jsonb_agg(r),'[]') from public.reports r where reporter=auth.uid()));end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-photos','profile-photos',false,2097152,array['image/jpeg']);
create policy private_photo_read on storage.objects for select to authenticated using(bucket_id='profile-photos' and exists(select 1 from public.photos f where f.path=name and private.can_view(f.user_id)));
-- No client uploads: the authenticated Netlify function validates and re-encodes images before server upload.

revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.active_user(uuid),private.blocked(uuid,uuid),private.complete_profile(uuid),private.can_match(uuid),private.can_view(uuid),private.is_admin() to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.get_me(),public.save_profile(jsonb),public.discover(jsonb),public.swipe(uuid,text),public.my_matches(),public.my_likes(),public.send_message(uuid,text,uuid),public.propose_date(uuid,jsonb),public.change_date(uuid,int,text,jsonb),public.block_user(uuid),public.unblock_user(uuid),public.report_user(uuid,text,text),public.moderate(uuid,text,text),public.admin_audit(),public.reserve_upload(),public.finish_upload(uuid,text),public.delete_photo(uuid),public.export_account() to authenticated;
grant execute on function public.provision_administrator(uuid) to service_role;
-- Realtime uses the same SELECT policies as HTTP reads; no public broadcast channel.
alter publication supabase_realtime add table public.messages,public.matches,public.date_plans;
