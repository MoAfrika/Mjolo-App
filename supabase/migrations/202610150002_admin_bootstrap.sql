create table private.admin_provisioning(token_hash text primary key,email text not null,expires timestamptz not null);
revoke all on private.admin_provisioning from public,anon,authenticated;
create function public.prepare_administrator(provisioning_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 if length(provisioning_token) not between 32 and 128 then raise exception 'Invalid provisioning token';end if;
 delete from private.admin_provisioning where expires<now();
 insert into private.admin_provisioning(token_hash,email,expires) values(encode(sha256(convert_to(provisioning_token,'UTF8')),'hex'),'skotch.ntilane@gmail.com',now()+interval '10 minutes');
end $$;
revoke all on function public.prepare_administrator(text) from public,anon,authenticated;
grant execute on function public.prepare_administrator(text) to service_role;
create or replace function private.bootstrap_user() returns trigger language plpgsql security definer set search_path='' as $$
declare d date; name text; admin_bootstrap boolean:=false; token text:=new.raw_user_meta_data->>'admin_provisioning_token';
begin
 name:=lower(new.raw_user_meta_data->>'username');
 if name is null or name !~ '^[a-z0-9_.]{3,30}$' then raise exception 'Valid username required';end if;
 if name='skotch.ntilane' and token is not null then
  delete from private.admin_provisioning where email=lower(new.email) and token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') and expires>now() returning true into admin_bootstrap;
 end if;
 admin_bootstrap:=coalesce(admin_bootstrap,false);
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
