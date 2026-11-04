-- Perfis do módulo de onboarding. Ficam em migration própria porque um valor novo de enum
-- não pode ser usado na mesma transação em que é criado.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operador';
