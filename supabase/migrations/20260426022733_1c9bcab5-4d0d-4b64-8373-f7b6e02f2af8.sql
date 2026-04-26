CREATE TABLE IF NOT EXISTS public.chat_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  wallpaper text NOT NULL DEFAULT 'default',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, partner_id)
);

ALTER TABLE public.chat_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat themes"
ON public.chat_themes FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat themes"
ON public.chat_themes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat themes"
ON public.chat_themes FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat themes"
ON public.chat_themes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER trg_chat_themes_updated_at
BEFORE UPDATE ON public.chat_themes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_chat_themes_user_partner
ON public.chat_themes (user_id, partner_id);