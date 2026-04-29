REVOKE EXECUTE ON FUNCTION public.get_conversations(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_last_seen() TO authenticated;