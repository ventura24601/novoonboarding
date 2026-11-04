ALTER TABLE public.clients ADD COLUMN paid boolean NOT NULL DEFAULT false, ADD COLUMN contract_verified_at timestamptz, ADD COLUMN onboarding_released_at timestamptz;
CREATE OR REPLACE FUNCTION public.clients_release_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF current_user NOT IN ('postgres','service_role','supabase_admin') AND COALESCE(auth.role(),'') <> 'service_role' THEN
  IF TG_OP = 'INSERT' THEN
   IF NEW.contract_verified_at IS NOT NULL THEN RAISE EXCEPTION 'Contract verification is server-managed'; END IF;
  ELSIF NEW.contract_verified_at IS DISTINCT FROM OLD.contract_verified_at THEN
   RAISE EXCEPTION 'Contract verification is server-managed';
  END IF;
 END IF;
 IF NEW.onboarding_released_at IS NOT NULL AND (NOT NEW.paid OR NOT NEW.contract_signed OR NEW.contract_verified_at IS NULL) THEN
  RAISE EXCEPTION 'Payment and verified contract required for onboarding release';
 END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.onboarding_released_at IS NOT NULL THEN NEW.onboarding_released_at := now(); END IF;
 ELSIF NEW.onboarding_released_at IS NOT NULL AND OLD.onboarding_released_at IS NULL THEN
  NEW.onboarding_released_at := now();
 ELSIF OLD.onboarding_released_at IS NOT NULL AND NEW.onboarding_released_at IS DISTINCT FROM OLD.onboarding_released_at THEN
  RAISE EXCEPTION 'Onboarding release timestamp cannot be changed';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER clients_release_guard BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.clients_release_guard();