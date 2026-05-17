-- Adds admins table and auth columns for farmers/buyers for prompt: complete authentication system
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) unique not null,
  password_hash varchar(255) not null,
  created_at timestamptz not null default now()
);
alter table farmers add column if not exists password_hash varchar(255);
alter table buyers add column if not exists password_hash varchar(255);
alter table buyers add column if not exists account_status varchar(80) not null default 'pending_setup';
alter table buyers add column if not exists setup_token varchar(255);
alter table buyers add column if not exists setup_token_expires_at timestamp;
