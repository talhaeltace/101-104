-- Adds support for "2 kapılı" card access locations (counts as 2 for KG-related steps)

alter table public.locations
add column if not exists is_two_door_card_access boolean not null default false;
