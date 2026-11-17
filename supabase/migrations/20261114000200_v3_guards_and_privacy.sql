-- Additional guards, export and deliberate private-data withdrawal. Local-only.
create or replace function private.v3_validate_soul(p jsonb) returns void language plpgsql set search_path='' as $$
declare e jsonb;
begin
 if p is null or jsonb_typeof(p) is distinct from 'object' or length(coalesce(p->>'title','')) not between 1 and 100 or coalesce(p->>'commitment','') not in ('DRAFT','COMMITTED') or jsonb_typeof(p->'evidence') is distinct from 'array' then raise check_violation using message='Invalid Soul';end if;
 if jsonb_array_length(p->'evidence')>12 or length(coalesce(p->>'topic',''))>80 or length(coalesce(p->>'horizon','')) not between 1 and 80 or length(coalesce(p->>'reasoning',''))>2000 or jsonb_typeof(p->'tags') is distinct from 'array' or jsonb_array_length(p->'tags')>10 then raise check_violation;end if;
 if p->>'commitment'='COMMITTED' and (length(coalesce(p->>'hypothesis',''))<10 or length(coalesce(p->>'topic',''))<1 or length(coalesce(p->>'opposingCase',''))<10 or length(coalesce(p->>'invalidation',''))<10 or (p->>'reviewAt') is null or (p->>'reviewAt')::timestamptz<=now() or (p->>'reviewAt')::timestamptz>now()+interval '5 years') then raise check_violation using message='Incomplete committed research';end if;
 if length(coalesce(p->>'hypothesis',''))>2000 or length(coalesce(p->>'opposingCase',''))>1500 or length(coalesce(p->>'invalidation',''))>1500 then raise check_violation;end if;
 for e in select value from jsonb_array_elements(p->'evidence') loop
 if jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'url','') !~ '^https://[^/@:]+\.[^/@:]+' or coalesce(e->>'stance','') not in ('SUPPORTS','OPPOSES','CONTEXT') or length(coalesce(e->>'title','')) not between 1 and 160 or length(coalesce(e->>'claim','')) not between 1 and 600 or e->>'publishedAt' is null or e->>'knownAt' is null or (e->>'publishedAt')::timestamptz>(e->>'knownAt')::timestamptz or (e->>'knownAt')::timestamptz>now() then raise check_violation using message='Invalid evidence';end if;
 end loop;
end $$;
create function private.v3_validate_scan(a jsonb) returns void language plpgsql set search_path='' as $$
declare c jsonb;f text;n numeric;
begin
 if a is null or jsonb_typeof(a) is distinct from 'object' or coalesce(a->>'schema','')<>'scan-v3.1' or coalesce(a->>'timeframe','')<>'EOD' or jsonb_typeof(a->'conditions') is distinct from 'array' then raise check_violation;end if;
 if jsonb_array_length(a->'conditions') not between 1 and 16 or length(coalesce(a->>'universe','')) not between 1 and 120 then raise check_violation;end if;
 for c in select value from jsonb_array_elements(a->'conditions') loop
 f:=c->>'field';
 if coalesce(f,'') not in ('close_vs_sma','rsi','avg_traded_value','delivery_pct','median_turnover','spread_bps','impact_bps') or coalesce(c->>'op','') not in ('gt','gte','lt','lte') or jsonb_typeof(c->'value') is distinct from 'number' then raise check_violation;end if;
 n:=(c->>'value')::numeric;if n<0 or (f in ('rsi','delivery_pct') and n>100) then raise check_violation;end if;
 if (f='close_vs_sma' and c->>'unit' is distinct from 'ratio') or (f in ('rsi','delivery_pct') and c->>'unit' is distinct from 'percent') or (f in ('avg_traded_value','median_turnover') and c->>'unit' is distinct from 'INR') or (f in ('spread_bps','impact_bps') and c->>'unit' is distinct from 'bps') then raise check_violation;end if;
 if f in ('close_vs_sma','rsi','avg_traded_value','median_turnover') and (coalesce(c->>'period','') !~ '^[0-9]+$' or (c->>'period')::integer not between 2 and 252) then raise check_violation;end if;
 end loop;
 foreach f in array array['feeBps','slippageBps','taxBps'] loop if jsonb_typeof(a->'costs'->f) is distinct from 'number' or (a->'costs'->>f)::numeric not between 0 and 1000 then raise check_violation;end if;end loop;
 if coalesce(a->'exit'->>'holdingBars','') !~ '^[0-9]+$' or (a->'exit'->>'holdingBars')::integer not between 1 and 252 then raise check_violation;end if;
end $$;
create function private.v3_guard_scan() returns trigger language plpgsql set search_path='' as $$ begin perform private.v3_validate_scan(new.ast);if length(new.branch) not between 1 and 60 or length(new.summary) not between 5 and 500 then raise check_violation;end if;return new;end $$;
create trigger v3_scan_validation before insert on public.v3_scan_versions for each row execute function private.v3_guard_scan();
create function private.v3_guard_event() returns trigger language plpgsql set search_path='' as $$
begin
 if new.event_type='REVIEW' and (coalesce(new.payload->>'outcome','') not in ('RESOLVED_SUPPORTED','RESOLVED_INVALIDATED','INCONCLUSIVE') or new.payload->>'observedAt' is null or new.payload->>'versionId' is null or coalesce(new.payload->>'sourceUrl','') !~ '^https://[^/@:]+\.[^/@:]+' or length(coalesce(new.payload->>'note','')) not between 10 and 2000) then raise check_violation;end if;
 return new;
end $$;
create trigger v3_event_validation before insert on public.v3_soul_events for each row execute function private.v3_guard_event();
create function private.v3_guard_profile() returns trigger language plpgsql set search_path='' as $$ begin if new.avatar_path is not null and new.avatar_path not like new.id::text||'/%' then raise check_violation;end if;return new;end $$;
create trigger v3_profile_validation before insert or update on public.v3_bodies for each row execute function private.v3_guard_profile();

create function public.v3_export_account() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise insufficient_privilege;end if;
 select jsonb_build_object('format','strategic-souls-v3-private-export','generatedAt',now(),
 'profile',(select to_jsonb(b) from public.v3_bodies b where id=auth.uid()),
 'holdings',coalesce((select jsonb_agg(to_jsonb(h)) from public.v3_holdings h),'[]'),
 'preferences',(select to_jsonb(p) from public.v3_notification_preferences p where body_id=auth.uid()),
 'souls',coalesce((select jsonb_agg(to_jsonb(s)) from public.v3_souls s),'[]'),
 'versions',coalesce((select jsonb_agg(to_jsonb(s)) from public.v3_soul_versions s),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(s)) from public.v3_soul_events s),'[]'),
 'scanVersions',coalesce((select jsonb_agg(to_jsonb(s)) from public.v3_scan_versions s),'[]'),
 'comments',coalesce((select jsonb_agg(to_jsonb(s)) from public.v3_comments s),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(s)) from public.v3_research_tasks s),'[]'),
 'moderation',coalesce((select jsonb_agg(to_jsonb(s)) from public.v3_moderation_cases s),'[]'),
 'notice','Includes currently authorized private and Team research, no provider market datasets. Does not include legacy D1 records.') into result;
 if octet_length(result::text)>20971520 then raise program_limit_exceeded using message='Export exceeds 20 MiB; operator-assisted full export required. No partial export returned.';end if;
 return result;
end $$;
create function public.v3_export_team(p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t uuid:=(p->>'teamId')::uuid;result jsonb;
begin
 if private.v3_role(t) is null then raise insufficient_privilege;end if;
 select jsonb_build_object('teamId',t,'generatedAt',now(),
 'souls',coalesce((select jsonb_agg(to_jsonb(s)) from public.v3_souls s where team_id=t),'[]'),
 'versions',coalesce((select jsonb_agg(to_jsonb(v)) from public.v3_soul_versions v join public.v3_souls s on s.id=v.soul_id where s.team_id=t),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(v)) from public.v3_soul_events v join public.v3_souls s on s.id=v.soul_id where s.team_id=t),'[]'),
 'comments',coalesce((select jsonb_agg(to_jsonb(v)) from public.v3_comments v join public.v3_souls s on s.id=v.soul_id where s.team_id=t),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(v)) from public.v3_research_tasks v join public.v3_souls s on s.id=v.soul_id where s.team_id=t),'[]'),
 'notice','Private research references only. Provider datasets and private unrelated research excluded.') into result;
 if octet_length(result::text)>20971520 then raise program_limit_exceeded;end if;return result;
end $$;
create function public.v3_erase_account(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if me is null or p->>'confirmation' is distinct from 'DELETE MY V3 DATA' then raise insufficient_privilege;end if;
 if exists(select 1 from public.v3_memberships where body_id=me and role='OWNER') then raise check_violation using message='Team owners must arrange an explicit ownership transfer before withdrawal.';end if;
 -- Refuse rather than damage a shared version graph that references private scans.
 if exists(select 1 from public.v3_scan_versions child join public.v3_scan_versions parent on parent.id=child.parent_id join public.v3_scan_definitions d on d.id=parent.scan_id join public.v3_scan_definitions c on c.id=child.scan_id where d.owner_id=me and d.team_id is null and (c.owner_id<>me or c.team_id is not null)) then raise check_violation using message='A shared scan references this private history; operator-assisted privacy review required.';end if;
 set constraints all deferred;
 delete from public.v3_strategy_outcomes where run_id in(select r.id from public.v3_scan_runs r join public.v3_scan_versions v on v.id=r.scan_version_id join public.v3_scan_definitions d on d.id=v.scan_id where d.owner_id=me and d.team_id is null);
 delete from public.v3_backtest_folds where run_id in(select r.id from public.v3_scan_runs r join public.v3_scan_versions v on v.id=r.scan_version_id join public.v3_scan_definitions d on d.id=v.scan_id where d.owner_id=me and d.team_id is null);
 delete from public.v3_scan_runs where scan_version_id in(select v.id from public.v3_scan_versions v join public.v3_scan_definitions d on d.id=v.scan_id where d.owner_id=me and d.team_id is null);
 delete from public.v3_scan_definitions where owner_id=me and team_id is null;
 delete from public.v3_failure_attributions where soul_event_id in(select e.id from public.v3_soul_events e join public.v3_souls s on s.id=e.soul_id where s.owner_id=me and s.team_id is null);
 delete from public.v3_souls where owner_id=me and team_id is null;
 delete from public.v3_holdings where owner_id=me;
 delete from public.v3_memberships where body_id=me;
 update private.v3_invites set revoked_at=now() where accepted_by=me or created_by=me;
 delete from public.v3_notification_preferences where body_id=me;
 delete from public.v3_body_handle_history where body_id=me;
 delete from public.v3_blocks where body_id=me or blocked_id=me;
 delete from public.v3_reports where body_id=me;
 delete from public.v3_moderation_cases where body_id=me;
 update public.v3_bodies set handle='deleted_'||substr(replace(me::text,'-',''),1,16),display_name='Deleted researcher',bio='',avatar_path=null,is_public=false where id=me;
 return jsonb_build_object('privateResearchWithdrawn',true,'identityDeleted',false,'notice','Private V3 research removed and profile anonymized. Shared research retains pseudonymous attribution. External Auth identity, legacy D1 records and backups require separate operator-managed retention/deletion.');
end $$;

revoke execute on function public.v3_export_account(),public.v3_export_team(jsonb),public.v3_erase_account(jsonb) from public,anon;
grant execute on function public.v3_export_account(),public.v3_export_team(jsonb),public.v3_erase_account(jsonb) to authenticated;
revoke all on function private.v3_validate_scan(jsonb),private.v3_guard_scan(),private.v3_guard_event(),private.v3_guard_profile() from public,anon,authenticated;
