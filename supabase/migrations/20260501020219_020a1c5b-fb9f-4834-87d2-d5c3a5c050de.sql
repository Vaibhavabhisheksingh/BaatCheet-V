
-- 1) Wipe all app data and auth users
DELETE FROM public.message_reactions;
DELETE FROM public.messages;
DELETE FROM public.message_requests;
DELETE FROM public.chat_themes;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM auth.users;

-- 2) Update username trigger: block admin-prefixed usernames, only one BaatCheet allowed
CREATE OR REPLACE FUNCTION public.handle_profile_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_count INTEGER;
  v_lower TEXT;
BEGIN
  v_lower := lower(NEW.username);

  -- Block any username that starts with "admin" (except the canonical BaatCheet)
  IF v_lower LIKE 'admin%' THEN
    RAISE EXCEPTION 'Usernames starting with "admin" are reserved.' USING ERRCODE = 'check_violation';
  END IF;

  -- Reserved username: only one BaatCheet ever (the admin)
  IF v_lower = 'baatcheet' THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.profiles
    WHERE lower(username) = 'baatcheet'
      AND user_id <> NEW.user_id;
    IF v_existing_count > 0 THEN
      RAISE EXCEPTION 'The username "BaatCheet" is reserved.' USING ERRCODE = 'unique_violation';
    END IF;
    NEW.username := 'BaatCheet';
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Make sure trigger exists on profiles for INSERT and UPDATE of username
DROP TRIGGER IF EXISTS profiles_username_admin_trigger ON public.profiles;
CREATE TRIGGER profiles_username_admin_trigger
BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_username();

-- 3) Welcome message trigger: when a new (non-admin) profile is created, BaatCheet sends a welcome
CREATE OR REPLACE FUNCTION public.send_welcome_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Skip if this is the admin's own profile
  IF lower(NEW.username) = 'baatcheet' THEN
    RETURN NEW;
  END IF;

  SELECT ur.user_id INTO v_admin_id
  FROM public.user_roles ur
  WHERE ur.role = 'admin'::public.app_role
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.messages (sender_id, receiver_id, content, media_type)
  VALUES (
    v_admin_id,
    NEW.user_id,
    'Welcome to BaatCheet! 👋 I''m the admin. Enjoy chatting with friends here.',
    'text'
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_welcome_message_trigger ON public.profiles;
CREATE TRIGGER profiles_welcome_message_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.send_welcome_message();
