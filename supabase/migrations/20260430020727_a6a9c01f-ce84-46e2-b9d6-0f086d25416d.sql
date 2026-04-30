
-- 1. Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer to check role without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- RLS: users see their own role; admins see all
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2. Add is_blocked to profiles
ALTER TABLE public.profiles ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT false;

-- 3. Reserve "BaatCheet" username + auto-grant admin role on signup
CREATE OR REPLACE FUNCTION public.handle_profile_username()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing_count INTEGER;
BEGIN
  -- Case-insensitive check: only one BaatCheet ever
  IF lower(NEW.username) = 'baatcheet' THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.profiles
    WHERE lower(username) = 'baatcheet'
      AND user_id <> NEW.user_id;
    IF v_existing_count > 0 THEN
      RAISE EXCEPTION 'The username "BaatCheet" is reserved.' USING ERRCODE = 'unique_violation';
    END IF;
    -- Force canonical casing
    NEW.username := 'BaatCheet';
    -- Auto-grant admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_profile_username() FROM public, anon;

CREATE TRIGGER profiles_username_admin_trigger
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_username();

-- 4. Update message-request gate: admin sender bypasses; admin recipient is blocked
CREATE OR REPLACE FUNCTION public.enforce_message_request_gate()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_status public.message_request_status;
  v_reverse_accepted BOOLEAN;
  v_recipient_messaged_back BOOLEAN;
  v_existing_count INTEGER;
  v_sender_blocked BOOLEAN;
  v_receiver_is_admin BOOLEAN;
  v_sender_is_admin BOOLEAN;
BEGIN
  -- Block messages from blocked users
  SELECT is_blocked INTO v_sender_blocked FROM public.profiles WHERE user_id = NEW.sender_id;
  IF COALESCE(v_sender_blocked, false) THEN
    RAISE EXCEPTION 'Your account has been blocked by an administrator.' USING ERRCODE = 'check_violation';
  END IF;

  v_sender_is_admin := public.is_admin(NEW.sender_id);
  v_receiver_is_admin := public.is_admin(NEW.receiver_id);

  -- Nobody can message the admin (admin is broadcast-only)
  IF v_receiver_is_admin AND NOT v_sender_is_admin THEN
    RAISE EXCEPTION 'You cannot reply to the administrator.' USING ERRCODE = 'check_violation';
  END IF;

  -- Admin sender bypasses the request gate entirely
  IF v_sender_is_admin THEN
    RETURN NEW;
  END IF;

  -- Existing logic
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.sender_id = NEW.receiver_id AND m.receiver_id = NEW.sender_id
  ) INTO v_recipient_messaged_back;

  IF v_recipient_messaged_back THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.message_requests
  WHERE requester_id = NEW.sender_id AND recipient_id = NEW.receiver_id;

  SELECT EXISTS (
    SELECT 1 FROM public.message_requests
    WHERE requester_id = NEW.receiver_id AND recipient_id = NEW.sender_id AND status = 'accepted'
  ) INTO v_reverse_accepted;

  IF v_status = 'accepted' OR v_reverse_accepted THEN RETURN NEW; END IF;

  IF v_status = 'ignored' THEN
    RAISE EXCEPTION 'Your message request was ignored.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_status = 'pending' THEN
    SELECT COUNT(*) INTO v_existing_count FROM public.messages m
    WHERE m.sender_id = NEW.sender_id AND m.receiver_id = NEW.receiver_id;
    IF v_existing_count >= 1 THEN
      RAISE EXCEPTION 'Waiting for recipient to accept your message request.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.message_requests (requester_id, recipient_id, status)
  VALUES (NEW.sender_id, NEW.receiver_id, 'pending')
  ON CONFLICT (requester_id, recipient_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on messages
DROP TRIGGER IF EXISTS enforce_message_request_gate_trg ON public.messages;
CREATE TRIGGER enforce_message_request_gate_trg
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_request_gate();

-- 5. Admin profile management: admin can update/delete any profile, set is_blocked
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete any profile" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Admin can delete any message
CREATE POLICY "Admins can delete any message" ON public.messages
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- 6. Block sign-in / actions from blocked users via additional RLS guard on messages
-- (Already handled by trigger above; also guard read access? leave reads alone.)

-- 7. Update get_conversations to exclude blocked users so admin still sees all but
-- normal users won't have direct convos with blocked users (their messages still readable).
-- (no change needed; left as-is)
