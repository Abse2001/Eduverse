create or replace function public.set_class_hidden(
  target_class_id uuid,
  hidden_from_user boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_class
  from public.classes
  where id = target_class_id;

  if target_class.id is null then
    raise exception 'Class not found';
  end if;

  if not public.has_org_role(target_class.organization_id, array['student']::public.app_role[]) then
    raise exception 'Only students can manage organization-visible class visibility';
  end if;

  if hidden_from_user and not target_class.organization_visible then
    raise exception 'Only organization-visible classes can be hidden';
  end if;

  if hidden_from_user then
    insert into public.class_visibility_preferences (
      organization_id,
      class_id,
      user_id,
      hidden,
      hidden_at
    )
    values (
      target_class.organization_id,
      target_class.id,
      current_user_id,
      true,
      now()
    )
    on conflict (class_id, user_id) do update
      set hidden = true,
          hidden_at = now(),
          updated_at = now();
  else
    delete from public.class_visibility_preferences
    where class_id = target_class.id
      and user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'result', case when hidden_from_user then 'hidden' else 'shown' end,
    'class_id', target_class.id,
    'organization_id', target_class.organization_id
  );
end;
$$;

drop policy if exists "students can delete org-visible class visibility preferences"
  on public.class_visibility_preferences;

create policy "students can delete their class visibility preferences"
  on public.class_visibility_preferences
  for delete
  using (
    user_id = auth.uid()
    and public.has_org_role(
      organization_id,
      array['student']::public.app_role[]
    )
  );

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

  if public.is_org_member(join_link.organization_id) then
    return jsonb_build_object(
      'result', 'already_member',
      'organization_id', join_link.organization_id,
      'role', join_link.default_role
    );
  end if;

  if join_link.approval_required then
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

create or replace function public.review_organization_join_request(
  target_request_id uuid,
  approved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_request public.organization_join_requests;
  target_profile public.profiles;
  target_join_link public.organization_join_links;
  membership_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_request
  from public.organization_join_requests
  where id = target_request_id
  limit 1;

  if target_request.id is null then
    raise exception 'Join request not found';
  end if;

  if target_request.status <> 'pending' then
    raise exception 'Only pending join requests can be reviewed';
  end if;

  if not public.has_org_role(target_request.organization_id, array['org_owner', 'org_admin']::public.app_role[]) then
    raise exception 'Only organization owners or admins can review join requests';
  end if;

  select *
    into target_profile
  from public.profiles
  where id = target_request.user_id;

  if approved then
    if target_request.join_link_id is not null then
      update public.organization_join_links
      set use_count = use_count + 1,
          updated_at = now()
      where id = target_request.join_link_id
        and (max_uses is null or use_count < max_uses)
      returning * into target_join_link;

      if target_join_link.id is null then
        raise exception 'Join link has reached its usage limit';
      end if;
    end if;

    membership_id := public.grant_organization_role(
      target_request.organization_id,
      target_request.user_id,
      target_request.requested_role
    );

    update public.profiles
    set default_organization_id = coalesce(default_organization_id, target_request.organization_id),
        updated_at = now()
    where id = target_request.user_id;
  end if;

  update public.organization_join_requests
  set status = case when approved then 'approved' else 'rejected' end,
      reviewed_by_user_id = current_user_id,
      reviewed_at = now(),
      updated_at = now()
  where id = target_request.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    target_request.organization_id,
    current_user_id,
    case when approved then 'organization.join_request_approved' else 'organization.join_request_rejected' end,
    'organization_join_request',
    target_request.id,
    jsonb_build_object(
      'email', target_profile.email,
      'role', target_request.requested_role
    )
  );

  return jsonb_build_object(
    'result', case when approved then 'approved' else 'rejected' end,
    'organization_id', target_request.organization_id,
    'request_id', target_request.id,
    'membership_id', membership_id,
    'role', target_request.requested_role
  );
end;
$$;

revoke all on function public.set_class_hidden(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.accept_organization_join_link(text)
  from public, anon, authenticated;
revoke all on function public.review_organization_join_request(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.set_class_hidden(uuid, boolean)
  to authenticated;
grant execute on function public.accept_organization_join_link(text)
  to authenticated;
grant execute on function public.review_organization_join_request(uuid, boolean)
  to authenticated;
