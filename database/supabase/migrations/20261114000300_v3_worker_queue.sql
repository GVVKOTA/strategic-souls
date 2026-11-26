-- A separately authorized Python worker claims jobs through HTTPS RPC, not the Sites Worker.
create table private.v3_worker_accounts(body_id uuid primary key references public.v3_bodies,enabled boolean not null default true);
alter table public.v3_scan_runs add column claimed_by uuid references public.v3_bodies;
alter table public.v3_scan_runs add column claimed_at timestamptz;
alter table public.v3_scan_runs add column request_fingerprint text not null;
create function private.v3_job_allowed(r public.v3_scan_runs) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.v3_dataset_versions ds join public.v3_source_entitlements e on e.id=ds.entitlement_id join public.v3_scan_versions v on v.id=r.scan_version_id join public.v3_scan_definitions d on d.id=v.scan_id where ds.id=r.dataset_version_id and e.analysis_allowed and e.expires_at>now() and ds.available_at<=now() and coalesce(ds.manifest->>'testOnly','false')<>'true' and (d.team_id is null and d.owner_id=r.created_by or d.team_id is not null and e.team_allowed and exists(select 1 from public.v3_memberships m where m.team_id=d.team_id and m.body_id=r.created_by and m.role in ('OWNER','ADMIN','EDITOR'))))
$$;
revoke all on function private.v3_job_allowed(public.v3_scan_runs) from public,anon,authenticated;
create function public.v3_queue_run(p jsonb) returns public.v3_scan_runs language plpgsql security definer set search_path='' as $$
declare v public.v3_scan_versions;d public.v3_scan_definitions;ds public.v3_dataset_versions;e public.v3_source_entitlements;r public.v3_scan_runs;fp text:=encode(sha256(convert_to(p::text,'UTF8')),'hex');
begin perform private.v3_limit('evaluation',30);
 if p->>'asOf' is null or (p->>'asOf')::timestamptz>now() then raise check_violation using message='Completed historical cutoff required';end if;
 if p->>'approved' is distinct from 'true' then raise check_violation using message='Explicit cost/plan approval required';end if;
 if not exists(select 1 from private.v3_worker_accounts where enabled) then raise check_violation using message='No authorized worker configured';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||coalesce(p->>'requestId',''),0));
 select * into r from public.v3_scan_runs where created_by=auth.uid() and request_id=(p->>'requestId')::uuid;
 if r.id is not null then if not private.v3_job_allowed(r) then raise insufficient_privilege;end if;if r.request_fingerprint<>fp then raise unique_violation;end if;return r;end if;
 select * into v from public.v3_scan_versions where id=(p->>'scanVersionId')::uuid;
 select * into d from public.v3_scan_definitions where id=v.scan_id;
 if d.id is null or not private.v3_can_edit(d.owner_id,d.team_id) then raise insufficient_privilege;end if;
 select * into ds from public.v3_dataset_versions where id=(p->>'datasetVersionId')::uuid;
 select * into e from public.v3_source_entitlements where id=ds.entitlement_id;
 if ds.id is null or e.id is null or not e.analysis_allowed or e.expires_at<=now() or (d.team_id is not null and not e.team_allowed) or coalesce(ds.manifest->>'testOnly','false')='true' or ds.available_at>now() then raise insufficient_privilege;end if;
 insert into public.v3_scan_runs(scan_version_id,created_by,dataset_version_id,manifest,request_id,request_fingerprint) values(v.id,auth.uid(),ds.id,jsonb_build_object('scanHash',v.digest,'datasetHash',ds.checksum,'executionModel','LONG_NEXT_OPEN_FIXED_HORIZON_V1','kind','SCREEN','asOf',p->>'asOf','entitlementId',e.id,'evaluatorVersion','quant-3.0.0'),(p->>'requestId')::uuid,fp) returning * into r;
 return r;
end $$;
create function public.v3_worker_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v3_scan_runs;v public.v3_scan_versions;ds public.v3_dataset_versions;
begin
 if not exists(select 1 from private.v3_worker_accounts where body_id=auth.uid() and enabled) then raise insufficient_privilege;end if;
 select * into r from public.v3_scan_runs where state='QUEUED' order by created_at for update skip locked limit 1;
 if r.id is null then return null;end if;
 if not private.v3_job_allowed(r) then update public.v3_scan_runs set state='FAILED',result='{"status":"BLOCKED","reason":"Rights or tenant authorization unavailable at claim time"}' where id=r.id;return null;end if;
 update public.v3_scan_runs set state='RUNNING',claimed_by=auth.uid(),claimed_at=now() where id=r.id;
 select * into v from public.v3_scan_versions where id=r.scan_version_id;
 select * into ds from public.v3_dataset_versions where id=r.dataset_version_id;
 return jsonb_build_object('id',r.id,'ast',v.ast,'datasetId',ds.id,'datasetHash',ds.checksum,'manifest',r.manifest);
end $$;
create function public.v3_worker_complete(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v3_scan_runs;
begin
 if not exists(select 1 from private.v3_worker_accounts where body_id=auth.uid() and enabled) then raise insufficient_privilege;end if;
 select * into r from public.v3_scan_runs where id=(p->>'id')::uuid for update;
 if r.id is null or r.claimed_by is distinct from auth.uid() or r.state not in ('RUNNING','SUCCEEDED','FAILED') then raise insufficient_privilege;end if;
 if p->>'datasetHash' is distinct from r.manifest->>'datasetHash' or p->>'evaluatorVersion' is distinct from 'quant-3.0.0' then raise check_violation;end if;
 if r.state<>'RUNNING' then if r.result is distinct from p->'result' then raise unique_violation;end if;return '{"saved":true}'::jsonb;end if;
 if not private.v3_job_allowed(r) then update public.v3_scan_runs set state='FAILED',result='{"status":"BLOCKED","reason":"Rights or tenant authorization revoked before completion"}' where id=r.id;return '{"saved":false,"blocked":true}'::jsonb;end if;
 if coalesce(p->'result'->>'status','') not in ('SCREENED','EVALUATED','BLOCKED') or jsonb_typeof(p->'result') is distinct from 'object' or octet_length((p->'result')::text)>1048576 then raise check_violation;end if;
 update public.v3_scan_runs set state=case when p->'result'->>'status'='BLOCKED' then 'FAILED' else 'SUCCEEDED' end,result=p->'result' where id=r.id;
 return '{"saved":true}'::jsonb;
end $$;
create function public.v3_worker_retry(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.v3_worker_accounts where body_id=auth.uid() and enabled) then raise insufficient_privilege;end if;
 update public.v3_scan_runs set state='QUEUED',claimed_by=null,claimed_at=null where id=(p->>'id')::uuid and state='RUNNING' and claimed_at<now()-interval '30 minutes';
 return jsonb_build_object('requeued',found);
end $$;
revoke all on function public.v3_queue_run(jsonb),public.v3_worker_claim(),public.v3_worker_complete(jsonb),public.v3_worker_retry(jsonb) from public,anon;
grant execute on function public.v3_queue_run(jsonb),public.v3_worker_claim(),public.v3_worker_complete(jsonb),public.v3_worker_retry(jsonb) to authenticated;
