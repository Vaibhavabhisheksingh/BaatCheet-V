-- Allow users to delete their own sent messages
CREATE POLICY "Users can delete their own messages" 
ON public.messages 
FOR DELETE 
USING (auth.uid() = sender_id);

-- Add last_seen column to profiles for online status tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Enable realtime for profiles to track online status
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Create function to update last_seen
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen = now()
  WHERE user_id = auth.uid();
END;
$$;