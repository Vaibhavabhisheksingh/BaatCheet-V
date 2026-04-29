-- Message requests gate first-time conversations between users.
-- Row exists per ordered pair (requester_id -> recipient_id).
-- Status flow: pending -> accepted | ignored. Recipient controls accept/ignore.

CREATE TYPE public.message_request_status AS ENUM ('pending', 'accepted', 'ignored');

CREATE TABLE public.message_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  status public.message_request_status NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  responded_at timestamp with time zone,
  CONSTRAINT message_requests_no_self CHECK (requester_id <> recipient_id),
  CONSTRAINT message_requests_unique_pair UNIQUE (requester_id, recipient_id)
);

CREATE INDEX idx_message_requests_recipient ON public.message_requests(recipient_id, status);
CREATE INDEX idx_message_requests_requester ON public.message_requests(requester_id, status);

ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;

-- Both parties can view requests they are part of
CREATE POLICY "Users can view their related requests"
ON public.message_requests
FOR SELECT
TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- Only the requester can create the initial request
CREATE POLICY "Requesters can create requests"
ON public.message_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = requester_id);

-- Only the recipient can update status (accept / ignore / reset)
CREATE POLICY "Recipients can update request status"
ON public.message_requests
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

-- Either party can delete (e.g. cancel/cleanup)
CREATE POLICY "Users can delete their related requests"
ON public.message_requests
FOR DELETE
TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- updated_at trigger
CREATE TRIGGER trg_message_requests_updated_at
BEFORE UPDATE ON public.message_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enforce gating at DB level: prevent sending a message unless either
--  (a) recipient previously messaged sender (implicit accept), or
--  (b) an accepted request exists in either direction, or
--  (c) sender has no existing pending/ignored block toward recipient
-- Simplest rule: BLOCK insert when an existing request from sender->receiver
-- has status 'ignored'. Allow 'pending' first message to flow through (it is
-- the request itself). Allow when accepted in either direction or when the
-- recipient has previously messaged the sender.
CREATE OR REPLACE FUNCTION public.enforce_message_request_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.message_request_status;
  v_reverse_accepted boolean;
  v_recipient_messaged_back boolean;
  v_existing_count integer;
BEGIN
  -- If the recipient already messaged the sender at any point, allow freely
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.sender_id = NEW.receiver_id
      AND m.receiver_id = NEW.sender_id
  ) INTO v_recipient_messaged_back;

  IF v_recipient_messaged_back THEN
    RETURN NEW;
  END IF;

  -- Look up existing request from sender -> receiver
  SELECT status INTO v_status
  FROM public.message_requests
  WHERE requester_id = NEW.sender_id
    AND recipient_id = NEW.receiver_id;

  -- Look up reverse request accepted
  SELECT EXISTS (
    SELECT 1 FROM public.message_requests
    WHERE requester_id = NEW.receiver_id
      AND recipient_id = NEW.sender_id
      AND status = 'accepted'
  ) INTO v_reverse_accepted;

  IF v_status = 'accepted' OR v_reverse_accepted THEN
    RETURN NEW;
  END IF;

  IF v_status = 'ignored' THEN
    RAISE EXCEPTION 'Your message request was ignored. You cannot send messages until % accepts.', NEW.receiver_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status = 'pending' THEN
    -- Already have a pending request: only allow if no messages yet from this sender
    SELECT COUNT(*) INTO v_existing_count
    FROM public.messages m
    WHERE m.sender_id = NEW.sender_id
      AND m.receiver_id = NEW.receiver_id;

    IF v_existing_count >= 1 THEN
      RAISE EXCEPTION 'Waiting for recipient to accept your message request.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- No request yet: auto-create pending request and allow this single first message
  INSERT INTO public.message_requests (requester_id, recipient_id, status)
  VALUES (NEW.sender_id, NEW.receiver_id, 'pending')
  ON CONFLICT (requester_id, recipient_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_message_request_gate
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_message_request_gate();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_requests;