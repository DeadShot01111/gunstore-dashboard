alter table public.craft_item_requirements
add column if not exists yield_per_craft numeric not null default 1;

update public.craft_item_requirements
set yield_per_craft = case
  when item_name ilike '%ammo%' then 5
  else 1
end
where yield_per_craft is null or yield_per_craft = 1;

alter table public.craft_item_requirements
drop column if exists wite;
