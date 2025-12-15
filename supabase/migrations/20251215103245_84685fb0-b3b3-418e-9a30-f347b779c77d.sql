-- Create messages table for direct messaging
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies - users can only see messages they sent or received
CREATE POLICY "Users can view their own messages" 
ON public.messages 
FOR SELECT 
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages" 
ON public.messages 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can mark messages as read" 
ON public.messages 
FOR UPDATE 
TO authenticated
USING (auth.uid() = receiver_id);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Create a function to get conversations with last message
CREATE OR REPLACE FUNCTION public.get_conversations(user_uuid UUID)
RETURNS TABLE (
  partner_id UUID,
  partner_username TEXT,
  partner_email TEXT,
  partner_bio TEXT,
  partner_image TEXT,
  last_message TEXT,
  last_message_time TIMESTAMP WITH TIME ZONE,
  last_message_sender UUID,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH conversation_partners AS (
    SELECT DISTINCT
      CASE 
        WHEN m.sender_id = user_uuid THEN m.receiver_id
        ELSE m.sender_id
      END AS partner_id
    FROM messages m
    WHERE m.sender_id = user_uuid OR m.receiver_id = user_uuid
  ),
  latest_messages AS (
    SELECT DISTINCT ON (
      CASE 
        WHEN m.sender_id = user_uuid THEN m.receiver_id
        ELSE m.sender_id
      END
    )
      CASE 
        WHEN m.sender_id = user_uuid THEN m.receiver_id
        ELSE m.sender_id
      END AS partner_id,
      m.content AS last_message,
      m.created_at AS last_message_time,
      m.sender_id AS last_message_sender
    FROM messages m
    WHERE m.sender_id = user_uuid OR m.receiver_id = user_uuid
    ORDER BY 
      CASE 
        WHEN m.sender_id = user_uuid THEN m.receiver_id
        ELSE m.sender_id
      END,
      m.created_at DESC
  ),
  unread_counts AS (
    SELECT 
      m.sender_id AS partner_id,
      COUNT(*) AS unread_count
    FROM messages m
    WHERE m.receiver_id = user_uuid AND m.is_read = false
    GROUP BY m.sender_id
  )
  SELECT 
    cp.partner_id,
    p.username AS partner_username,
    p.email AS partner_email,
    p.bio AS partner_bio,
    p.profile_image AS partner_image,
    lm.last_message,
    lm.last_message_time,
    lm.last_message_sender,
    COALESCE(uc.unread_count, 0) AS unread_count
  FROM conversation_partners cp
  JOIN profiles p ON p.user_id = cp.partner_id
  JOIN latest_messages lm ON lm.partner_id = cp.partner_id
  LEFT JOIN unread_counts uc ON uc.partner_id = cp.partner_id
  ORDER BY lm.last_message_time DESC;
END;
$$;