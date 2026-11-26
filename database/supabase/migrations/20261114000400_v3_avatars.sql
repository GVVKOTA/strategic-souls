create function public.v3_set_avatar(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.v3_limit('avatar',20);
 if coalesce(p->>'path','') !~ ('^'||auth.uid()::text||'/avatar-[0-9a-f]{64}\.(png|jpg|webp)$') then raise check_violation;end if;
 update public.v3_bodies set avatar_path=p->>'path' where id=auth.uid();
 if not found then raise insufficient_privilege;end if;
 return '{"saved":true}'::jsonb;
end $$;
revoke all on function public.v3_set_avatar(jsonb) from public,anon;
grant execute on function public.v3_set_avatar(jsonb) to authenticated;
