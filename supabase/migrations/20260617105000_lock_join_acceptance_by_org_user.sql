create or replace function public.accept_organization_join_link(join_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles;
  join_link public.organization_join_links;
  membership_id uuid;
  request_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into current_profile
  from public.profiles
  where id = current_user_id;

  if current_profile.id is null then
    raise exception 'Profile not found';
  end if;

  select *
    into join_link
  from public.organization_join_links
  where token = join_token
    and enabled
  limit 1;

  if join_link.id is null then
    raise exception 'Join link not found or disabled';
  end if;

  if join_link.expires_at is not null and join_link.expires_at < now() then
    raise exception 'Join link has expired';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(join_link.organization_id::text || ':' || current_user_id::text, 0)
  );

  if public.is_org_member(join_link.organization_id) then
    return jsonb_build_object(
      'result', 'already_member',
      'organization_id', join_link.organization_id,
      'role', join_link.default_role
    );
  end if;

  if join_link.approval_required then
    select *
      into join_link
    from public.organization_join_links
    where id = join_link.id;

    if join_link.max_uses is not null and join_link.use_count >= join_link.max_uses then
      raise exception 'Join link has reached its usage limit';
    end if;

    insert into public.organization_join_requests (
      organization_id,
      join_link_id,
      user_id,
      requested_role,
      status
    )
    values (
      join_link.organization_id,
      join_link.id,
      current_user_id,
      join_link.default_role,
      'pending'
    )
    on conflict (organization_id, user_id) where status = 'pending' do update
      set requested_role = excluded.requested_role,
          join_link_id = excluded.join_link_id,
          updated_at = now()
    returning id into request_id;

    insert into public.audit_logs (
      organization_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      payload
    )
    values (
      join_link.organization_id,
      current_user_id,
      'organization.join_requested',
      'organization_join_request',
      request_id,
      jsonb_build_object('email', current_profile.email, 'role', join_link.default_role)
    );

    return jsonb_build_object(
      'result', 'request_pending',
      'organization_id', join_link.organization_id,
      'request_id', request_id,
      'role', join_link.default_role
    );
  end if;

  update public.organization_join_links
  set use_count = use_count + 1,
      updated_at = now()
  where id = join_link.id
    and (max_uses is null or use_count < max_uses)
  returning * into join_link;

  if join_link.id is null then
    raise exception 'Join link has reached its usage limit';
  end if;

  membership_id := public.grant_organization_role(
    join_link.organization_id,
    current_user_id,
    join_link.default_role
  );

  update public.profiles
  set default_organization_id = coalesce(default_organization_id, join_link.organization_id),
      updated_at = now()
  where id = current_user_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    join_link.organization_id,
    current_user_id,
    'organization.join_link_accepted',
    'organization_membership',
    membership_id,
    jsonb_build_object('email', current_profile.email, 'role', join_link.default_role)
  );

  return jsonb_build_object(
    'result', 'joined',
    'organization_id', join_link.organization_id,
    'membership_id', membership_id,
    'role', join_link.default_role
  );
end;
$$;

revoke all on function public.accept_organization_join_link(text)
  from public, anon, authenticated;

grant execute on function public.accept_organization_join_link(text)
  to authenticated;
