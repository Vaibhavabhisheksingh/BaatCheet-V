ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone;

DROP POLICY IF EXISTS "Users can mark messages as read" ON public.messages;

CREATE POLICY "Receivers can mark messages as read"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);

CREATE POLICY "Senders can edit their own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);