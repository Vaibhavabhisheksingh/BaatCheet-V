-- Add media columns to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'text' CHECK (media_type IN ('text', 'image', 'video'));

-- Create message reactions table
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS on reactions
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for reactions
CREATE POLICY "Users can view reactions on their messages"
ON public.message_reactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
    AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

CREATE POLICY "Users can add reactions to messages they can see"
ON public.message_reactions
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
    AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

CREATE POLICY "Users can remove their own reactions"
ON public.message_reactions
FOR DELETE
USING (auth.uid() = user_id);

-- Create storage bucket for chat media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'video/mp4']
);

-- Storage policies for chat media
CREATE POLICY "Authenticated users can upload chat media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view chat media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-media');

CREATE POLICY "Users can delete their own chat media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;