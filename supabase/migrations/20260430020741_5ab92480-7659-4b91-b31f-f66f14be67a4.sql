
-- Trigger functions should not be directly callable
REVOKE EXECUTE ON FUNCTION public.enforce_message_request_gate() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_profile_username() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM public, anon, authenticated;
-- Keep get_conversations / update_last_seen / has_role / is_admin executable by authenticated (needed by app)
