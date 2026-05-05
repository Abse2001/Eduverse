alter table public.class_live_sessions
  drop constraint if exists class_live_sessions_status_valid;

alter table public.class_live_sessions
  add constraint class_live_sessions_status_valid
  check (status in ('pending', 'live', 'ended'));

create or replace function public.claim_class_live_session(
  target_org_id uuid,
  target_class_id uuid,
  target_room_name text,
  stale_before timestamptz
)
returns table (live_session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  class_org_id uuid;
  current_session public.class_live_sessions%rowtype;
  next_live_session_id uuid;
begin
  select organization_id
    into class_org_id
    from public.classes
    where id = target_class_id
      and organization_id = target_org_id
      and is_archived = false;

  if class_org_id is null then
    raise exception 'Class not found.';
  end if;

  if not public.can_manage_class(class_org_id, target_class_id) then
    raise exception 'Only class managers can start live sessions.';
  end if;

  loop
    select *
      into current_session
      from public.class_live_sessions
      where class_id = target_class_id
      for update;

    if found then
      if
        current_session.status in ('pending', 'live')
        and current_session.ended_at is null
        and current_session.last_seen_at > stale_before
      then
        update public.class_live_sessions
          set room_name = target_room_name,
              started_by_user_id = auth.uid(),
              last_seen_at = now(),
              ended_at = null
          where id = current_session.id
          returning public.class_live_sessions.live_session_id
            into live_session_id;

        return next;
      end if;

      next_live_session_id := gen_random_uuid();

      update public.class_live_sessions
        set room_name = target_room_name,
            live_session_id = next_live_session_id,
            started_by_user_id = auth.uid(),
            status = 'pending',
            started_at = now(),
            last_seen_at = now(),
            ended_at = null
        where id = current_session.id
        returning public.class_live_sessions.live_session_id
          into live_session_id;

      return next;
    end if;

    begin
      next_live_session_id := gen_random_uuid();

      insert into public.class_live_sessions (
        organization_id,
        class_id,
        room_name,
        live_session_id,
        started_by_user_id,
        status,
        started_at,
        last_seen_at,
        ended_at
      )
      values (
        class_org_id,
        target_class_id,
        target_room_name,
        next_live_session_id,
        auth.uid(),
        'pending',
        now(),
        now(),
        null
      )
      returning public.class_live_sessions.live_session_id
        into live_session_id;

      return next;
    exception
      when unique_violation then
    end;
  end loop;
end;
$$;
