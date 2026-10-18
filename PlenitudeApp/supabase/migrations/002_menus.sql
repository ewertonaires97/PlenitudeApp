create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_services (
  menu_id uuid not null references public.menus(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (menu_id, service_id)
);

alter table public.quotes
  add column if not exists menu_id uuid references public.menus(id) on delete set null;

create trigger menus_updated_at
before update on public.menus
for each row execute function public.set_updated_at();

alter table public.menus enable row level security;
alter table public.menu_services enable row level security;

create policy "authenticated users can manage menus"
on public.menus for all to authenticated using (true) with check (true);

create policy "authenticated users can manage menu services"
on public.menu_services for all to authenticated using (true) with check (true);

create index if not exists menu_services_service_id_idx on public.menu_services(service_id);
create index if not exists quotes_menu_id_idx on public.quotes(menu_id);