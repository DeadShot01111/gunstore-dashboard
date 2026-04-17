create extension if not exists pgcrypto;

create table if not exists public.craft_item_requirements (
  id uuid primary key default gen_random_uuid(),
  item_name text not null unique,
  titanium numeric not null default 0,
  scrap numeric not null default 0,
  steel numeric not null default 0,
  plastic numeric not null default 0,
  aluminum numeric not null default 0,
  rubber numeric not null default 0,
  electronics numeric not null default 0,
  glass numeric not null default 0,
  wite numeric not null default 0,
  gunpowder numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_craft_item_requirements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_craft_item_requirements_updated_at on public.craft_item_requirements;

create trigger set_craft_item_requirements_updated_at
before update on public.craft_item_requirements
for each row
execute function public.set_craft_item_requirements_updated_at();

alter table public.craft_item_requirements enable row level security;

drop policy if exists "craft_item_requirements_public_read" on public.craft_item_requirements;
create policy "craft_item_requirements_public_read"
on public.craft_item_requirements
for select
using (true);

drop policy if exists "craft_item_requirements_public_write" on public.craft_item_requirements;
create policy "craft_item_requirements_public_write"
on public.craft_item_requirements
for all
using (true)
with check (true);
