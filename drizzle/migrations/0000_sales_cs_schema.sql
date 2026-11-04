create type public.app_role as enum ('admin', 'vendedor', 'cs');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "Authenticated read profiles" on public.profiles for select to authenticated using (true);
create policy "Update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Read own roles or admin" on public.user_roles for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

-- whether any user exists (for bootstrap signup)
create or replace function public.has_any_users()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles) $$;
grant execute on function public.has_any_users() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.email, ''));
  if is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  clinic_name text not null,
  phone text,
  client_type text not null default 'nao_aluno',
  address text,
  legal_name text,
  specialty text,
  products text[] not null default '{}',
  document text,
  email text,
  seller_id uuid references public.profiles(id) on delete set null,
  notes text,
  current_scenario text,
  goal text,
  pain text,
  special_condition text,
  value numeric(12,2) not null default 0,
  contract_signed boolean not null default false,
  contract_signed_at timestamptz,
  whatsapp_group boolean not null default false,
  onboarding_sent boolean not null default false,
  started_at timestamptz not null default now(),
  onboarding_completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;
alter table public.clients enable row level security;
create policy "Team reads clients" on public.clients for select to authenticated using (true);
create policy "Team inserts clients" on public.clients for insert to authenticated with check (true);
create policy "Team updates clients" on public.clients for update to authenticated using (true);
create policy "Admin deletes clients" on public.clients for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.clients_track()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  if new.contract_signed and new.contract_signed_at is null then new.contract_signed_at := now(); end if;
  if not new.contract_signed then new.contract_signed_at := null; end if;
  if new.contract_signed and new.whatsapp_group and new.onboarding_sent then
    if new.onboarding_completed_at is null then new.onboarding_completed_at := now(); end if;
  else
    new.onboarding_completed_at := null;
  end if;
  return new;
end; $$;
create trigger clients_track before insert or update on public.clients
  for each row execute function public.clients_track();