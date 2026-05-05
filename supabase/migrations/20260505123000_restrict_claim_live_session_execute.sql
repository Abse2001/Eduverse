revoke all on function public.claim_class_live_session(uuid, uuid, text, timestamptz)
  from public;

grant execute on function public.claim_class_live_session(uuid, uuid, text, timestamptz)
  to authenticated;
