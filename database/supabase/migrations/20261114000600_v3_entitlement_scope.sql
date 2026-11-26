alter table public.v3_source_entitlements add column derived_allowed boolean not null default false;
-- Entitlements must explicitly name their intended audience; no blanket access by omission.
alter table public.v3_source_entitlements add column audience text not null default 'OPERATOR_ONLY' check(audience in ('OPERATOR_ONLY','PERSONAL','TEAM','APP_INTERNAL'));
alter table public.v3_source_entitlements add column owner_id uuid references public.v3_bodies;
alter table public.v3_source_entitlements add column team_id uuid references public.v3_teams;
create function private.v3_dataset_allowed(dataset uuid,body uuid,sharing_team uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.v3_dataset_versions ds join public.v3_source_entitlements e on e.id=ds.entitlement_id where ds.id=dataset and e.analysis_allowed and e.derived_allowed and e.expires_at>now() and ds.available_at<=now() and coalesce(ds.manifest->>'testOnly','false')<>'true' and (sharing_team is null or e.team_allowed) and (e.audience='APP_INTERNAL' or e.audience='PERSONAL' and e.owner_id=body and sharing_team is null or e.audience='TEAM' and e.team_id=sharing_team and exists(select 1 from public.v3_memberships m where m.team_id=e.team_id and m.body_id=body)))
$$;
revoke all on function private.v3_dataset_allowed(uuid,uuid,uuid) from public,anon,authenticated;
create function private.v3_guard_run() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.v3_scan_definitions;ds public.v3_dataset_versions;
begin
 select s.* into d from public.v3_scan_definitions s join public.v3_scan_versions v on v.scan_id=s.id where v.id=new.scan_version_id;
 select * into ds from public.v3_dataset_versions where id=new.dataset_version_id;
 if not private.v3_dataset_allowed(new.dataset_version_id,new.created_by,d.team_id) then raise insufficient_privilege;end if;
 if jsonb_typeof(ds.manifest->'rows') is distinct from 'number' or (ds.manifest->>'rows')::numeric not between 1 and 1000000 then raise check_violation using message='A finite reviewed dataset of at most one million rows is required';end if;
 return new;
end $$;
create trigger v3_run_entitlement before insert on public.v3_scan_runs for each row execute function private.v3_guard_run();
create or replace function private.v3_job_allowed(r public.v3_scan_runs) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.v3_scan_versions v join public.v3_scan_definitions d on d.id=v.scan_id where v.id=r.scan_version_id and private.v3_dataset_allowed(r.dataset_version_id,r.created_by,d.team_id) and (d.team_id is null and d.owner_id=r.created_by or d.team_id is not null and exists(select 1 from public.v3_memberships m where m.team_id=d.team_id and m.body_id=r.created_by and m.role in ('OWNER','ADMIN','EDITOR'))))
$$;
create function public.v3_dataset_catalog(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=nullif(p->>'teamId','')::uuid;result jsonb;
begin
 if not exists(select 1 from public.v3_bodies where id=auth.uid()) or (t is not null and private.v3_role(t) is null) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'provider',e.provider,'datasetHash',d.checksum,'researchCutoff',d.manifest->>'asOf','rows',d.manifest->'rows','teamAllowed',e.team_allowed)),'[]') into result from public.v3_dataset_versions d join public.v3_source_entitlements e on e.id=d.entitlement_id where private.v3_dataset_allowed(d.id,auth.uid(),t);
 return result;
end $$;
revoke all on function private.v3_guard_run() from public,anon,authenticated;
revoke all on function public.v3_dataset_catalog(jsonb) from public,anon;
grant execute on function public.v3_dataset_catalog(jsonb) to authenticated;
-- Saved results must respect current data rights as well as current membership.
create function private.v3_result_allowed(r public.v3_scan_runs) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.v3_scan_versions v join public.v3_scan_definitions d on d.id=v.scan_id where v.id=r.scan_version_id and private.v3_can_read(d.owner_id,d.team_id) and private.v3_dataset_allowed(r.dataset_version_id,auth.uid(),d.team_id))
$$;
revoke all on function private.v3_result_allowed(public.v3_scan_runs) from public,anon;
grant execute on function private.v3_result_allowed(public.v3_scan_runs) to authenticated;
alter policy authorized on public.v3_scan_runs using(private.v3_result_allowed(v3_scan_runs));
