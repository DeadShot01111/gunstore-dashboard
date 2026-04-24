create extension if not exists pgcrypto;

create table if not exists public.ammo_promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_percent numeric not null default 50,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ammo_promotions_discount_percent_check
    check (discount_percent >= 0 and discount_percent <= 100),
  constraint ammo_promotions_window_check
    check (ends_at > starts_at)
);

create index if not exists ammo_promotions_active_window_idx
  on public.ammo_promotions (active, starts_at, ends_at);

create or replace function public.set_ammo_promotions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ammo_promotions_updated_at on public.ammo_promotions;

create trigger set_ammo_promotions_updated_at
before update on public.ammo_promotions
for each row
execute function public.set_ammo_promotions_updated_at();

alter table public.ammo_promotions enable row level security;

drop policy if exists "ammo_promotions_public_read" on public.ammo_promotions;
create policy "ammo_promotions_public_read"
on public.ammo_promotions
for select
using (true);

drop policy if exists "ammo_promotions_public_write" on public.ammo_promotions;
create policy "ammo_promotions_public_write"
on public.ammo_promotions
for all
using (true)
with check (true);

alter table public.order_items
add column if not exists pricing_rule text;

alter table public.order_items
add column if not exists promotion_id uuid;

alter table public.order_items
add column if not exists promotion_name text;

alter table public.order_items
add column if not exists promotion_discount_percent numeric;
