create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) unique not null,
  password_hash varchar(255) not null,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create policy "Admins can view admins"
  on public.admins for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

alter table public.farmers add column if not exists password_hash varchar(255);
alter table public.buyers add column if not exists password_hash varchar(255);
alter table public.buyers add column if not exists account_status varchar(80) not null default 'pending_setup';
alter table public.buyers add column if not exists setup_token varchar(255);
alter table public.buyers add column if not exists setup_token_expires_at timestamp;