-- Wipe app data
DELETE FROM public.message_reactions;
DELETE FROM public.messages;
DELETE FROM public.message_requests;
DELETE FROM public.chat_themes;
DELETE FROM public.profiles;

-- Wipe auth users (storage objects will be cleaned via Storage API separately)
DELETE FROM auth.users;

-- Tighten storage: remove broad public SELECT policies
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Chat media is publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for chat media" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view chat media" ON storage.objects;

-- Owner-scoped read policies (files still reachable via signed/public URL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users can view their own avatar files'
  ) THEN
    CREATE POLICY "Users can view their own avatar files"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users can view their own chat media files'
  ) THEN
    CREATE POLICY "Users can view their own chat media files"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END$$;