
REVOKE EXECUTE ON FUNCTION public.send_welcome_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_profile_username() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_message_request_gate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_last_seen() TO authenticated;
