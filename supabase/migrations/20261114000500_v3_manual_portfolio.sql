create table public.v3_holdings(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.v3_bodies,payload jsonb not null,dedupe_key text not null,archived_at timestamptz,created_at timestamptz not null default now(),unique(owner_id,dedupe_key));
alter table public.v3_holdings enable row level security;
revoke all on public.v3_holdings from public,anon,authenticated;
grant select on public.v3_holdings to authenticated;
create policy own on public.v3_holdings for select to authenticated using(owner_id=auth.uid());
create function public.v3_import_holdings(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h jsonb;v jsonb;count_saved integer:=0;changed integer;
begin perform private.v3_limit('holding_import',60);
 if jsonb_typeof(p->'rows') is distinct from 'array' or jsonb_array_length(p->'rows') not between 1 and 100 then raise check_violation;end if;
 if (select count(*) from public.v3_holdings where owner_id=auth.uid())>5000 then raise program_limit_exceeded;end if;
 for h in select value from jsonb_array_elements(p->'rows') loop
 if jsonb_typeof(h->'quantity') is distinct from 'number' or jsonb_typeof(h->'cost') is distinct from 'number' or (h->>'quantity')::numeric<=0 or (h->>'quantity')::numeric>1e12 or (h->>'cost')::numeric<0 or (h->>'cost')::numeric>1e12 or coalesce(h->>'currency','') not in ('INR','USD','EUR','GBP','JPY','USDT') or length(btrim(coalesce(h->>'symbol',''))) not between 1 and 40 or btrim(h->>'symbol') ~ '^[=+@-]' or length(btrim(coalesce(h->>'account',''))) not between 1 and 60 or btrim(h->>'account') ~ '^[=+@-]' or coalesce(h->>'assetClass','') not in ('Indian equity','ETF','Mutual fund','Indian derivative','Bond / fixed income','Cash','MCX commodity','Gold / silver','Global investment','Crypto') then raise check_violation using message='Invalid holding';end if;
 v:=jsonb_build_object('symbol',upper(btrim(h->>'symbol')),'assetClass',h->>'assetClass','quantity',(h->>'quantity')::numeric,'cost',(h->>'cost')::numeric,'currency',h->>'currency','account',btrim(h->>'account'));
 insert into public.v3_holdings(owner_id,payload,dedupe_key) values(auth.uid(),v,encode(sha256(convert_to(v::text,'UTF8')),'hex')) on conflict(owner_id,dedupe_key) do nothing;
 get diagnostics changed=row_count;count_saved:=count_saved+changed;
 end loop;
 insert into public.v3_audit_events(actor_id,action) values(auth.uid(),'MANUAL_HOLDINGS_IMPORTED');
 return jsonb_build_object('saved',count_saved,'duplicates',jsonb_array_length(p->'rows')-count_saved,'notice','Manual acquisition-cost records, never live valuations.');
end $$;
create function public.v3_archive_holding(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.v3_limit('holding_archive',120);
 update public.v3_holdings set archived_at=case when p->>'restore'='true' then null else now() end where id=(p->>'id')::uuid and owner_id=auth.uid();
 if not found then raise insufficient_privilege;end if;
 insert into public.v3_audit_events(actor_id,action,resource_id) values(auth.uid(),case when p->>'restore'='true' then 'HOLDING_RESTORED' else 'HOLDING_ARCHIVED' end,(p->>'id')::uuid);
 return '{"saved":true}'::jsonb;end $$;
revoke all on function public.v3_import_holdings(jsonb),public.v3_archive_holding(jsonb) from public,anon;
grant execute on function public.v3_import_holdings(jsonb),public.v3_archive_holding(jsonb) to authenticated;
-- Existing private buckets must satisfy the same privacy contract; never assume it.
do $$ begin if exists(select 1 from storage.buckets where id='v3-private' and public) then raise exception 'v3-private is public; stop and reconcile storage configuration';end if;end $$;
