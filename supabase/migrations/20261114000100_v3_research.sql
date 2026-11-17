-- Local Supabase only. Does not alter D1 or the Sites hosting manifest.
-- PostgreSQL built-in SHA-256 and UUID randomness; no extra crypto extension needed.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create type public.v3_team_role as enum ('OWNER','ADMIN','EDITOR','REVIEWER','VIEWER');
create table public.v3_bodies (
 id uuid primary key references auth.users(id) on delete cascade,
 handle text not null unique check(handle=lower(handle) and handle ~ '^[a-z][a-z0-9_]{2,23}$'),
 display_name text not null check(length(display_name) between 1 and 60),
 bio text not null default '' check(length(bio)<=300),
 avatar_path text,
 is_public boolean not null default false,
 created_at timestamptz not null default now(),
 check(handle not in ('admin','administrator','support','moderator','gvv','strategic_souls','api','root','system','deleted','null','official','sebi','nse'))
);
create table public.v3_body_handle_history(id uuid primary key default gen_random_uuid(),body_id uuid not null references public.v3_bodies on delete cascade,handle text not null,created_at timestamptz not null default now());
create table public.v3_notification_preferences(body_id uuid primary key references public.v3_bodies on delete cascade,preferences jsonb not null default '{"mode":"Beginner","reviewReminders":false,"teamNotifications":false}');
create table public.v3_teams(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 2 and 80),slug text unique not null check(slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),created_at timestamptz not null default now());
create table public.v3_memberships(team_id uuid references public.v3_teams on delete cascade,body_id uuid references public.v3_bodies on delete cascade,role public.v3_team_role not null,created_at timestamptz not null default now(),primary key(team_id,body_id));
create table private.v3_invites(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.v3_teams on delete cascade,token_hash text unique not null,role public.v3_team_role not null check(role<>'OWNER'),target_handle text,created_by uuid not null references public.v3_bodies,expires_at timestamptz not null,accepted_by uuid references public.v3_bodies,revoked_at timestamptz);
create table public.v3_souls(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.v3_bodies,team_id uuid references public.v3_teams,head_id uuid,title text not null,created_at timestamptz not null default now());
create table public.v3_soul_versions(id uuid primary key default gen_random_uuid(),soul_id uuid not null references public.v3_souls on delete cascade,parent_id uuid references public.v3_soul_versions,author_id uuid not null references public.v3_bodies,payload jsonb not null,digest text not null,request_id uuid not null,created_at timestamptz not null default now(),request_fingerprint text not null,unique(author_id,request_id));
alter table public.v3_souls add constraint v3_soul_head_fk foreign key(head_id) references public.v3_soul_versions deferrable initially deferred;
create table public.v3_soul_evidence(id uuid primary key default gen_random_uuid(),version_id uuid not null references public.v3_soul_versions on delete cascade,title text not null,url text not null,published_at timestamptz not null,known_at timestamptz not null,stance text not null,claim text not null,check(published_at<=known_at));
create table public.v3_soul_events(id uuid primary key default gen_random_uuid(),soul_id uuid not null references public.v3_souls on delete cascade,author_id uuid not null references public.v3_bodies,event_type text not null check(event_type in ('REVIEW','ARCHIVE','RESTORE','MERGE_DECISION')),payload jsonb not null,request_id uuid not null,created_at timestamptz not null default now(),request_fingerprint text not null,unique(author_id,request_id));
create table public.v3_comments(id uuid primary key default gen_random_uuid(),soul_id uuid not null references public.v3_souls on delete cascade,author_id uuid not null references public.v3_bodies,content text not null check(length(content) between 1 and 2000),request_id uuid not null,created_at timestamptz not null default now(),request_fingerprint text not null,unique(author_id,request_id));
create table public.v3_research_tasks(id uuid primary key default gen_random_uuid(),soul_id uuid not null references public.v3_souls on delete cascade,created_by uuid not null references public.v3_bodies,assignee_id uuid references public.v3_bodies,title text not null,due_at timestamptz,state text not null default 'OPEN' check(state in ('OPEN','DONE')),revision integer not null default 1,created_at timestamptz not null default now());
create table public.v3_scan_definitions(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.v3_bodies,team_id uuid references public.v3_teams,name text not null,head_id uuid,created_at timestamptz not null default now());
create table public.v3_scan_versions(id uuid primary key default gen_random_uuid(),scan_id uuid not null references public.v3_scan_definitions on delete cascade,parent_id uuid references public.v3_scan_versions,author_id uuid not null references public.v3_bodies,branch text not null,summary text not null,ast jsonb not null,digest text not null,request_id uuid not null,created_at timestamptz not null default now(),request_fingerprint text not null,unique(author_id,request_id));
alter table public.v3_scan_definitions add foreign key(head_id) references public.v3_scan_versions deferrable initially deferred;
create table public.v3_source_entitlements(id uuid primary key default gen_random_uuid(),provider text not null,rights_reference text not null,display_allowed boolean not null default false,analysis_allowed boolean not null default false,team_allowed boolean not null default false,public_allowed boolean not null default false,expires_at timestamptz not null,reviewed_by text not null,created_at timestamptz not null default now());
create table public.v3_dataset_versions(id uuid primary key default gen_random_uuid(),entitlement_id uuid not null references public.v3_source_entitlements,manifest jsonb not null,checksum text not null,available_at timestamptz not null,created_at timestamptz not null default now());
create table public.v3_scan_runs(id uuid primary key default gen_random_uuid(),scan_version_id uuid not null references public.v3_scan_versions,created_by uuid not null references public.v3_bodies,dataset_version_id uuid not null references public.v3_dataset_versions,manifest jsonb not null,result jsonb,state text not null default 'QUEUED' check(state in ('QUEUED','RUNNING','SUCCEEDED','FAILED')),request_id uuid not null,created_at timestamptz not null default now(),unique(created_by,request_id));
create table public.v3_backtest_folds(id uuid primary key default gen_random_uuid(),run_id uuid not null references public.v3_scan_runs,fold_index integer not null,manifest jsonb not null,metrics jsonb not null,unique(run_id,fold_index));
create table public.v3_strategy_outcomes(id uuid primary key default gen_random_uuid(),run_id uuid not null references public.v3_scan_runs,payload jsonb not null,created_at timestamptz not null default now());
create table public.v3_failure_attributions(id uuid primary key default gen_random_uuid(),soul_event_id uuid not null references public.v3_soul_events,run_id uuid references public.v3_scan_runs,payload jsonb not null,created_at timestamptz not null default now());
create table public.v3_security_master(id uuid primary key default gen_random_uuid(),isin text,venue text not null,currency text not null,valid_from timestamptz not null,valid_until timestamptz,source_ref text not null);
create table public.v3_instrument_aliases(id uuid primary key default gen_random_uuid(),security_id uuid not null references public.v3_security_master,symbol text not null,provider text not null,valid_from timestamptz not null,valid_until timestamptz);
create table public.v3_corporate_actions(id uuid primary key default gen_random_uuid(),security_id uuid not null references public.v3_security_master,action_type text not null,ex_at timestamptz not null,known_at timestamptz not null,terms jsonb not null,source_ref text not null,version integer not null);
create table public.v3_quote_snapshots(id uuid primary key default gen_random_uuid(),security_id uuid not null references public.v3_security_master,entitlement_id uuid not null references public.v3_source_entitlements,payload jsonb not null,event_at timestamptz not null,retrieved_at timestamptz not null);
create table public.v3_indicator_cache_versions(id uuid primary key default gen_random_uuid(),dataset_id uuid not null references public.v3_dataset_versions,manifest jsonb not null,checksum text not null,created_at timestamptz not null default now());
create table public.v3_moderation_cases(id uuid primary key default gen_random_uuid(),body_id uuid not null references public.v3_bodies,payload jsonb not null,appeal text,created_at timestamptz not null default now());
create table public.v3_blocks(body_id uuid references public.v3_bodies on delete cascade,blocked_id uuid references public.v3_bodies on delete cascade,created_at timestamptz not null default now(),primary key(body_id,blocked_id),check(body_id<>blocked_id));
create table public.v3_reports(id uuid primary key default gen_random_uuid(),body_id uuid not null references public.v3_bodies,payload jsonb not null,created_at timestamptz not null default now());
create table public.v3_audit_events(id bigint generated always as identity primary key,actor_id uuid references public.v3_bodies,team_id uuid references public.v3_teams,action text not null,resource_id uuid,created_at timestamptz not null default now());
create table private.v3_rate_limits(body_id uuid not null,bucket text not null,window_at timestamptz not null,count integer not null,primary key(body_id,bucket));
create table private.v3_legacy_handoffs(token_hash text primary key,legacy_subject_hash text not null,expires_at timestamptz not null,consumed_by uuid unique,consumed_at timestamptz);
create table private.v3_legacy_links(legacy_subject_hash text primary key,body_id uuid unique not null references public.v3_bodies,created_at timestamptz not null default now());

create index on public.v3_souls(owner_id,created_at desc);
create index on public.v3_souls(team_id,created_at desc);
create index on public.v3_soul_versions(soul_id,created_at);
create index on public.v3_soul_events(soul_id,created_at);
create index on public.v3_comments(soul_id,created_at);
create index on public.v3_memberships(body_id,team_id);
create index on public.v3_scan_versions(scan_id,created_at);

create function private.v3_role(t uuid) returns public.v3_team_role language sql stable security definer set search_path='' as $$ select role from public.v3_memberships where team_id=t and body_id=auth.uid() $$;
create function private.v3_can_read(o uuid,t uuid) returns boolean language sql stable security definer set search_path='' as $$ select coalesce(auth.uid() is not null and case when t is null then o=auth.uid() else private.v3_role(t) is not null end,false) $$;
create function private.v3_can_edit(o uuid,t uuid) returns boolean language sql stable security definer set search_path='' as $$ select coalesce(auth.uid() is not null and case when t is null then o=auth.uid() else private.v3_role(t) in ('OWNER','ADMIN','EDITOR') end,false) $$;
create function private.v3_read_soul(s uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.v3_souls where id=s and private.v3_can_read(owner_id,team_id)) $$;
create function private.v3_edit_soul(s uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.v3_souls where id=s and private.v3_can_edit(owner_id,team_id)) $$;
create function private.v3_read_scan(s uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.v3_scan_definitions where id=s and private.v3_can_read(owner_id,team_id)) $$;
create function private.v3_limit(b text,cap integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 insert into private.v3_rate_limits values(auth.uid(),b,date_trunc('hour',now()),1) on conflict(body_id,bucket) do update set count=case when private.v3_rate_limits.window_at<date_trunc('hour',now()) then 1 else private.v3_rate_limits.count+1 end,window_at=date_trunc('hour',now()) returning count into n;
 if n>cap then raise exception using errcode='P0001',message='Rate limit exceeded'; end if;
end $$;
create function private.v3_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Immutable research; append a new version or event.'; end $$;
do $$ declare t text; begin foreach t in array array['soul_versions','soul_evidence','soul_events','comments','scan_versions','backtest_folds','strategy_outcomes','failure_attributions','dataset_versions','indicator_cache_versions','audit_events','body_handle_history'] loop execute format('create trigger v3_immutable before update on public.v3_%I for each row execute function private.v3_immutable()',t);end loop;end $$;

-- Read policies; writes are restricted to validated RPC transactions below.
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' and tablename like 'v3_%' loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);execute format('grant select on public.%I to authenticated',t);end loop;end $$;
create policy own_or_opted_in on public.v3_bodies for select to authenticated using(id=auth.uid() or is_public or exists(select 1 from public.v3_memberships m where m.body_id=id and private.v3_role(m.team_id) is not null));
create policy own on public.v3_body_handle_history for select to authenticated using(body_id=auth.uid());
create policy own on public.v3_notification_preferences for select to authenticated using(body_id=auth.uid());
create policy member on public.v3_teams for select to authenticated using(private.v3_role(id) is not null);
create policy member on public.v3_memberships for select to authenticated using(private.v3_role(team_id) is not null);
create policy authorized on public.v3_souls for select to authenticated using(private.v3_can_read(owner_id,team_id));
create policy authorized on public.v3_soul_versions for select to authenticated using(private.v3_read_soul(soul_id));
create policy authorized on public.v3_soul_evidence for select to authenticated using(exists(select 1 from public.v3_soul_versions v where v.id=version_id and private.v3_read_soul(v.soul_id)));
create policy authorized on public.v3_soul_events for select to authenticated using(private.v3_read_soul(soul_id));
create policy authorized on public.v3_comments for select to authenticated using(private.v3_read_soul(soul_id));
create policy authorized on public.v3_research_tasks for select to authenticated using(private.v3_read_soul(soul_id));
create policy authorized on public.v3_scan_definitions for select to authenticated using(private.v3_can_read(owner_id,team_id));
create policy authorized on public.v3_scan_versions for select to authenticated using(private.v3_read_scan(scan_id));
create policy authorized on public.v3_scan_runs for select to authenticated using(exists(select 1 from public.v3_scan_versions v where v.id=scan_version_id and private.v3_read_scan(v.scan_id)));
create policy authorized on public.v3_backtest_folds for select to authenticated using(exists(select 1 from public.v3_scan_runs r where r.id=run_id));
create policy authorized on public.v3_strategy_outcomes for select to authenticated using(exists(select 1 from public.v3_scan_runs r where r.id=run_id));
create policy authorized on public.v3_failure_attributions for select to authenticated using(exists(select 1 from public.v3_soul_events e where e.id=soul_event_id));
create policy own on public.v3_moderation_cases for select to authenticated using(body_id=auth.uid());
create policy own on public.v3_blocks for select to authenticated using(body_id=auth.uid());
create policy own on public.v3_reports for select to authenticated using(body_id=auth.uid());
create policy authorized on public.v3_audit_events for select to authenticated using((team_id is null and actor_id=auth.uid()) or private.v3_role(team_id) is not null);
-- Provider/entitlement/data catalog has no browser SELECT policy until rights are loaded.

create function public.v3_save_profile(p jsonb) returns public.v3_bodies language plpgsql security definer set search_path='' as $$
declare result public.v3_bodies; old_handle text;
begin
 perform private.v3_limit('profile',30);
 if p->>'adult' is distinct from 'true' or p->>'privacy' is distinct from 'true' or p->>'terms' is distinct from 'true' then raise check_violation using message='Explicit adult, privacy and terms consent required';end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and coalesce(is_anonymous,false)=false) then raise insufficient_privilege;end if;
 select handle into old_handle from public.v3_bodies where id=auth.uid() for update;
 insert into public.v3_bodies(id,handle,display_name,bio,is_public) values(auth.uid(),p->>'handle',p->>'display_name',p->>'bio',coalesce((p->>'is_public')::boolean,false))
 on conflict(id) do update set handle=excluded.handle,display_name=excluded.display_name,bio=excluded.bio,is_public=excluded.is_public returning * into result;
 if old_handle is distinct from result.handle then insert into public.v3_body_handle_history(body_id,handle) values(auth.uid(),result.handle);end if;
 insert into public.v3_notification_preferences values(auth.uid(),coalesce(p->'preferences','{}'::jsonb)||jsonb_build_object('consentAt',now(),'consentVersion','v3-local-2026-11-14','adult',true,'privacy',true,'terms',true)) on conflict(body_id) do update set preferences=excluded.preferences;
 insert into public.v3_audit_events(actor_id,action,resource_id) values(auth.uid(),'PROFILE_SAVED',auth.uid());
 return result;
end $$;

create function public.v3_create_team(p jsonb) returns public.v3_teams language plpgsql security definer set search_path='' as $$
declare t public.v3_teams;
begin perform private.v3_limit('team',10);
 if not exists(select 1 from public.v3_bodies where id=auth.uid()) then raise insufficient_privilege;end if;
 insert into public.v3_teams(name,slug) values(p->>'name',p->>'slug') returning * into t;
 insert into public.v3_memberships values(t.id,auth.uid(),'OWNER',now());
 insert into public.v3_audit_events(actor_id,team_id,action,resource_id) values(auth.uid(),t.id,'TEAM_CREATED',t.id);return t;
end $$;

create function public.v3_invite(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=(p->>'teamId')::uuid;r public.v3_team_role:=(p->>'role')::public.v3_team_role;token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');invite_id uuid;
begin perform private.v3_limit('invite',30);
 if private.v3_role(t) not in ('OWNER','ADMIN') or private.v3_role(t) is null or r='OWNER' or (private.v3_role(t)='ADMIN' and r='ADMIN') then raise insufficient_privilege;end if;
 insert into private.v3_invites(team_id,token_hash,role,target_handle,created_by,expires_at) values(t,encode(sha256(convert_to(token,'UTF8')),'hex'),r,nullif(p->>'handle',''),auth.uid(),now()+interval '48 hours') returning id into invite_id;
 insert into public.v3_audit_events(actor_id,team_id,action,resource_id) values(auth.uid(),t,'INVITE_CREATED',invite_id);
 return jsonb_build_object('id',invite_id,'token',token,'expiresInHours',48);
end $$;
create function public.v3_accept_invite(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i private.v3_invites; h text;
begin perform private.v3_limit('accept_invite',30);
 select handle into h from public.v3_bodies where id=auth.uid();if h is null then raise insufficient_privilege;end if;
 select * into i from private.v3_invites where token_hash=encode(sha256(convert_to(p->>'token','UTF8')),'hex') for update;
 if i.id is null or i.revoked_at is not null or i.accepted_by is not null or i.expires_at<=now() or (i.target_handle is not null and i.target_handle<>h) then raise exception using errcode='42501',message='Invitation unavailable';end if;
 if exists(select 1 from public.v3_blocks where (body_id=i.created_by and blocked_id=auth.uid()) or (blocked_id=i.created_by and body_id=auth.uid())) then raise insufficient_privilege;end if;
 insert into public.v3_memberships values(i.team_id,auth.uid(),i.role,now()) on conflict do nothing;
 update private.v3_invites set accepted_by=auth.uid() where id=i.id;
 insert into public.v3_audit_events(actor_id,team_id,action,resource_id) values(auth.uid(),i.team_id,'INVITE_ACCEPTED',i.id);return jsonb_build_object('teamId',i.team_id);
end $$;
create function public.v3_manage_member(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=(p->>'teamId')::uuid;b uuid:=(p->>'bodyId')::uuid; r public.v3_team_role; mine public.v3_team_role;
begin perform private.v3_limit('member',60);
 perform 1 from public.v3_teams where id=t for update;mine:=private.v3_role(t);
 select role into r from public.v3_memberships where team_id=t and body_id=b;
 if mine is null or r is null or r='OWNER' or mine not in ('OWNER','ADMIN') or (mine='ADMIN' and (r='ADMIN' or p->>'role' in ('OWNER','ADMIN'))) or p->>'role'='OWNER' then raise insufficient_privilege;end if;
 if p->>'action'='remove' then delete from public.v3_memberships where team_id=t and body_id=b;
 else update public.v3_memberships set role=(p->>'role')::public.v3_team_role where team_id=t and body_id=b;end if;
 insert into public.v3_audit_events(actor_id,team_id,action,resource_id) values(auth.uid(),t,'MEMBER_CHANGED',b);return '{"saved":true}'::jsonb;
end $$;
create function public.v3_revoke_invite(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid;
begin select team_id into t from private.v3_invites where id=(p->>'id')::uuid for update;
 if private.v3_role(t) is null or private.v3_role(t) not in ('OWNER','ADMIN') then raise insufficient_privilege;end if;
 update private.v3_invites set revoked_at=now() where id=(p->>'id')::uuid;
 insert into public.v3_audit_events(actor_id,team_id,action,resource_id) values(auth.uid(),t,'INVITE_REVOKED',(p->>'id')::uuid);return '{"saved":true}'::jsonb;end $$;

-- Database validation is repeated because authenticated users can call REST/RPC directly.
create function private.v3_validate_soul(p jsonb) returns void language plpgsql set search_path='' as $$
declare e jsonb;
begin
 if jsonb_typeof(p)<>'object' or length(coalesce(p->>'title','')) not between 1 and 100 or p->>'commitment' not in ('DRAFT','COMMITTED') or jsonb_typeof(p->'evidence')<>'array' or jsonb_array_length(p->'evidence')>12 then raise check_violation using message='Invalid Soul';end if;
 if p->>'commitment'='COMMITTED' and (length(coalesce(p->>'hypothesis',''))<10 or length(coalesce(p->>'opposingCase',''))<10 or length(coalesce(p->>'invalidation',''))<10 or (p->>'reviewAt') is null or (p->>'reviewAt')::timestamptz<=now()) then raise check_violation using message='Incomplete committed research';end if;
 if length(coalesce(p->>'hypothesis',''))>2000 or length(coalesce(p->>'opposingCase',''))>1500 or length(coalesce(p->>'invalidation',''))>1500 then raise check_violation;end if;
 for e in select value from jsonb_array_elements(p->'evidence') loop
 if e->>'url' !~ '^https://[^/@:]+\.[^/@:]+' or (e->>'publishedAt')::timestamptz>(e->>'knownAt')::timestamptz or (e->>'knownAt')::timestamptz>now() then raise check_violation using message='Invalid source';end if;
 end loop;
end $$;
create function private.v3_check_team_text(t uuid,p text) returns void language plpgsql set search_path='' as $$
begin if t is not null and p ~* '(guarantee[d]?|risk.free|sure.shot|pump this|pump and dump|for your portfolio.{0,60}(buy|sell)|you (must|should).{0,60}(buy|sell)|double your money|join my paid|verified profits|[0-9]{2,3}%[ ]*(win rate|accuracy))' then raise check_violation using message='Team content needs moderation review';end if;end $$;
create function public.v3_save_soul(p jsonb) returns public.v3_soul_versions language plpgsql security definer set search_path='' as $$
declare s public.v3_souls;v public.v3_soul_versions;prior public.v3_soul_versions;content jsonb:=p->'payload'; e jsonb;t uuid:=nullif(p->>'teamId','')::uuid;
begin perform private.v3_limit('soul',120);perform private.v3_validate_soul(content);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||coalesce(p->>'requestId',''),0));
 select * into prior from public.v3_soul_versions where author_id=auth.uid() and request_id=(p->>'requestId')::uuid;
 if prior.id is not null then if not private.v3_edit_soul(prior.soul_id) then raise insufficient_privilege;end if;if prior.request_fingerprint<>encode(sha256(convert_to(p::text,'UTF8')),'hex') then raise unique_violation;end if;return prior;end if;
 if p->>'soulId' is null then
 if not private.v3_can_edit(auth.uid(),t) then raise insufficient_privilege;end if;
 insert into public.v3_souls(owner_id,team_id,title) values(auth.uid(),t,content->>'title') returning * into s;
 else select * into s from public.v3_souls where id=(p->>'soulId')::uuid for update;
 if s.id is null or not private.v3_can_edit(s.owner_id,s.team_id) then raise insufficient_privilege;end if;
 if s.head_id is distinct from (p->>'expectedHead')::uuid then raise serialization_failure using message='Concurrent revision';end if;
 end if;
 perform private.v3_check_team_text(s.team_id,content::text);
 insert into public.v3_soul_versions(soul_id,parent_id,author_id,payload,digest,request_id,request_fingerprint) values(s.id,s.head_id,auth.uid(),content,encode(sha256(convert_to(content::text,'UTF8')),'hex'),(p->>'requestId')::uuid,encode(sha256(convert_to(p::text,'UTF8')),'hex')) returning * into v;
 for e in select value from jsonb_array_elements(content->'evidence') loop insert into public.v3_soul_evidence(version_id,title,url,published_at,known_at,stance,claim) values(v.id,e->>'title',e->>'url',(e->>'publishedAt')::timestamptz,(e->>'knownAt')::timestamptz,e->>'stance',e->>'claim');end loop;
 update public.v3_souls set head_id=v.id,title=content->>'title' where id=s.id;
 insert into public.v3_audit_events(actor_id,team_id,action,resource_id) values(auth.uid(),s.team_id,'SOUL_VERSION_COMMITTED',v.id);
 return v;
end $$;
create function public.v3_append_event(p jsonb) returns public.v3_soul_events language plpgsql security definer set search_path='' as $$
declare s public.v3_souls;v public.v3_soul_versions;r public.v3_soul_events;prior public.v3_soul_events;kind text:=p->>'type';content jsonb:=p->'payload';
begin perform private.v3_limit('event',240);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||coalesce(p->>'requestId',''),0));
 select * into s from public.v3_souls where id=(p->>'soulId')::uuid for update;
 if s.id is null or not private.v3_can_read(s.owner_id,s.team_id) then raise insufficient_privilege;end if;
 if kind='REVIEW' then
 if s.team_id is not null and private.v3_role(s.team_id)='VIEWER' then raise insufficient_privilege;end if;
 select * into v from public.v3_soul_versions where id=(content->>'versionId')::uuid and soul_id=s.id;
 if v.id is null or content->>'outcome' not in ('RESOLVED_SUPPORTED','RESOLVED_INVALIDATED','INCONCLUSIVE') or (content->>'observedAt')::timestamptz<v.created_at or (content->>'observedAt')::timestamptz>now() or length(coalesce(content->>'note','')) not between 10 and 2000 or coalesce(content->>'sourceUrl','') !~ '^https://' then raise check_violation;end if;
 elsif kind in ('ARCHIVE','RESTORE','MERGE_DECISION') then if not private.v3_can_edit(s.owner_id,s.team_id) then raise insufficient_privilege;end if;
 else raise check_violation;end if;
 select * into prior from public.v3_soul_events where author_id=auth.uid() and request_id=(p->>'requestId')::uuid;
 if prior.id is not null then if prior.request_fingerprint<>encode(sha256(convert_to(p::text,'UTF8')),'hex') then raise unique_violation;end if;return prior;end if;
 perform private.v3_check_team_text(s.team_id,content::text);
 insert into public.v3_soul_events(soul_id,author_id,event_type,payload,request_id,request_fingerprint) values(s.id,auth.uid(),kind,content,(p->>'requestId')::uuid,encode(sha256(convert_to(p::text,'UTF8')),'hex')) returning * into r;
 insert into public.v3_audit_events(actor_id,team_id,action,resource_id) values(auth.uid(),s.team_id,'SOUL_'||kind,r.id);return r;
end $$;
create function public.v3_comment(p jsonb) returns public.v3_comments language plpgsql security definer set search_path='' as $$
declare s public.v3_souls;r public.v3_comments;
begin perform private.v3_limit('comment',120);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||coalesce(p->>'requestId',''),0));
 select * into s from public.v3_souls where id=(p->>'soulId')::uuid;
 if s.id is null or not private.v3_can_read(s.owner_id,s.team_id) or (s.team_id is not null and private.v3_role(s.team_id)='VIEWER') then raise insufficient_privilege;end if;
 perform private.v3_check_team_text(s.team_id,p->>'content');
 select * into r from public.v3_comments where author_id=auth.uid() and request_id=(p->>'requestId')::uuid;
 if r.id is not null then if r.request_fingerprint<>encode(sha256(convert_to(p::text,'UTF8')),'hex') then raise unique_violation;end if;return r;end if;
 insert into public.v3_comments(soul_id,author_id,content,request_id,request_fingerprint) values(s.id,auth.uid(),p->>'content',(p->>'requestId')::uuid,encode(sha256(convert_to(p::text,'UTF8')),'hex')) returning * into r;return r;
end $$;
create function public.v3_task(p jsonb) returns public.v3_research_tasks language plpgsql security definer set search_path='' as $$
declare s public.v3_souls;r public.v3_research_tasks;a uuid:=nullif(p->>'assigneeId','')::uuid;
begin perform private.v3_limit('task',120);
 select * into s from public.v3_souls where id=(p->>'soulId')::uuid;
 if s.id is null or not private.v3_can_edit(s.owner_id,s.team_id) then raise insufficient_privilege;end if;
 if a is not null and a<>s.owner_id and not exists(select 1 from public.v3_memberships where team_id=s.team_id and body_id=a) then raise insufficient_privilege;end if;
 if p->>'id' is null then insert into public.v3_research_tasks(soul_id,created_by,assignee_id,title,due_at) values(s.id,auth.uid(),a,p->>'title',nullif(p->>'dueAt','')::timestamptz) returning * into r;
 else update public.v3_research_tasks set state=p->>'state',revision=revision+1 where id=(p->>'id')::uuid and soul_id=s.id and revision=(p->>'expectedRevision')::integer returning * into r;
 if r.id is null then raise serialization_failure;end if;end if;return r;end $$;

create function public.v3_save_scan(p jsonb) returns public.v3_scan_versions language plpgsql security definer set search_path='' as $$
declare d public.v3_scan_definitions;v public.v3_scan_versions;old public.v3_scan_versions;t uuid:=nullif(p->>'teamId','')::uuid;a jsonb:=p->'ast';c jsonb;
begin perform private.v3_limit('scan_version',120);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||coalesce(p->>'requestId',''),0));
 if a->>'schema'<>'scan-v3.1' or a->>'timeframe'<>'EOD' or jsonb_array_length(a->'conditions') not between 1 and 16 then raise check_violation;end if;
 for c in select value from jsonb_array_elements(a->'conditions') loop
 if c->>'field' not in ('close_vs_sma','rsi','avg_traded_value','delivery_pct','median_turnover','spread_bps','impact_bps') or c->>'op' not in ('gt','gte','lt','lte') or (c->>'value')::numeric<0 then raise check_violation;end if;end loop;
 select * into old from public.v3_scan_versions where author_id=auth.uid() and request_id=(p->>'requestId')::uuid;
 if old.id is not null then select * into d from public.v3_scan_definitions where id=old.scan_id;if d.id is null or not private.v3_can_edit(d.owner_id,d.team_id) then raise insufficient_privilege;end if;if old.request_fingerprint<>encode(sha256(convert_to(p::text,'UTF8')),'hex') then raise unique_violation;end if;return old;end if;
 if p->>'scanId' is null then if not private.v3_can_edit(auth.uid(),t) then raise insufficient_privilege;end if;insert into public.v3_scan_definitions(owner_id,team_id,name) values(auth.uid(),t,p->>'name') returning * into d;
 else select * into d from public.v3_scan_definitions where id=(p->>'scanId')::uuid for update;
 if d.id is null or not private.v3_can_edit(d.owner_id,d.team_id) then raise insufficient_privilege;end if;
 if d.head_id is distinct from (p->>'expectedHead')::uuid then raise serialization_failure;end if;end if;
 if p->>'parentId' is not null and not exists(select 1 from public.v3_scan_versions x where x.id=(p->>'parentId')::uuid and private.v3_read_scan(x.scan_id)) then raise insufficient_privilege;end if;
 insert into public.v3_scan_versions(scan_id,parent_id,author_id,branch,summary,ast,digest,request_id,request_fingerprint) values(d.id,coalesce((p->>'parentId')::uuid,d.head_id),auth.uid(),p->>'branch',p->>'summary',a,encode(sha256(convert_to(a::text,'UTF8')),'hex'),(p->>'requestId')::uuid,encode(sha256(convert_to(p::text,'UTF8')),'hex')) returning * into v;
 update public.v3_scan_definitions set head_id=v.id where id=d.id;
 insert into public.v3_audit_events(actor_id,team_id,action,resource_id) values(auth.uid(),d.team_id,'SCAN_VERSION_COMMITTED',v.id);return v;
end $$;

create function public.v3_record_moderation(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i uuid;begin perform private.v3_limit('moderation',60);insert into public.v3_moderation_cases(body_id,payload) values(auth.uid(),p) returning id into i;return jsonb_build_object('id',i);end $$;
create function public.v3_appeal(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin update public.v3_moderation_cases set appeal=p->>'appeal' where id=(p->>'id')::uuid and body_id=auth.uid();if not found then raise insufficient_privilege;end if;return '{"submitted":true,"reviewerService":"NOT_CONFIGURED"}'::jsonb;end $$;
create function public.v3_block(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.v3_limit('block',60);insert into public.v3_blocks values(auth.uid(),(p->>'bodyId')::uuid,now()) on conflict do nothing;return '{"saved":true}'::jsonb;end $$;
create function public.v3_report(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.v3_limit('report',20);insert into public.v3_reports(body_id,payload) values(auth.uid(),p);return '{"recorded":true,"staffedReview":"NOT_CONFIGURED"}'::jsonb;end $$;

-- One-use legacy handoff registration is operator-only, never email matching.
create function public.v3_register_handoff(p jsonb) returns void language plpgsql security definer set search_path='' as $$
begin insert into private.v3_legacy_handoffs(token_hash,legacy_subject_hash,expires_at) values(p->>'tokenHash',p->>'legacySubjectHash',now()+interval '10 minutes');end $$;
create function public.v3_consume_handoff(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h private.v3_legacy_handoffs;begin
 perform private.v3_limit('handoff',10);
 select * into h from private.v3_legacy_handoffs where token_hash=encode(sha256(convert_to(p->>'token','UTF8')),'hex') for update;
 if h.token_hash is null or h.consumed_by is not null or h.expires_at<=now() then raise insufficient_privilege;end if;
 insert into private.v3_legacy_links values(h.legacy_subject_hash,auth.uid(),now());
 update private.v3_legacy_handoffs set consumed_by=auth.uid(),consumed_at=now() where token_hash=h.token_hash;
 return '{"linked":true,"dataImported":false}'::jsonb;end $$;

-- Privileges are explicit. No authenticated user can write tables directly.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.v3_role(uuid),private.v3_can_read(uuid,uuid),private.v3_can_edit(uuid,uuid),private.v3_read_soul(uuid),private.v3_edit_soul(uuid),private.v3_read_scan(uuid) to authenticated;
do $$ declare f record;begin for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname like 'v3_%' loop execute format('revoke execute on function %s from public, anon, authenticated',f.signature);if f.proname<>'v3_register_handoff' then execute format('grant execute on function %s to authenticated',f.signature);end if;end loop;end $$;
grant execute on function public.v3_register_handoff(jsonb) to service_role;

-- Private Storage: only the user's own directory, no public bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('v3-private','v3-private',false,5242880,array['image/png','image/jpeg','image/webp','application/json','text/plain']) on conflict(id) do nothing;
create policy v3_private_read on storage.objects for select to authenticated using(bucket_id='v3-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy v3_private_insert on storage.objects for insert to authenticated with check(bucket_id='v3-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy v3_private_update on storage.objects for update to authenticated using(bucket_id='v3-private' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='v3-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy v3_private_delete on storage.objects for delete to authenticated using(bucket_id='v3-private' and (storage.foldername(name))[1]=auth.uid()::text);
