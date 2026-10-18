create extension if not exists pgcrypto;

create type public.quote_status as enum ('draft', 'sent', 'confirmed', 'cancelled', 'expired');
create type public.event_status as enum ('planned', 'in_progress', 'completed', 'cancelled');
create type public.activity_status as enum ('pending', 'in_progress', 'completed', 'skipped');
create type public.guest_status as enum ('pending', 'confirmed', 'declined');
create type public.stock_movement_type as enum ('in', 'out', 'adjustment');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  default_price numeric(12,2) not null default 0 check (default_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  unit text not null default 'unidade',
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(12,2) not null default 0 check (minimum_quantity >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_materials (
  service_id uuid not null references public.services(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  primary key (service_id, inventory_item_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number bigint generated always as identity unique,
  name text not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  venue text,
  event_date date,
  event_time time,
  status public.quote_status not null default 'draft',
  notes text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  additional_fee numeric(12,2) not null default 0 check (additional_fee >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  confirmed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint confirmed_quote_requires_date check (status <> 'confirmed' or event_date is not null)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  sort_order integer not null default 0
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  name text not null,
  venue text,
  event_date date not null,
  event_time time,
  status public.event_status not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ceremonial_activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  description text,
  responsible text,
  scheduled_time time,
  status public.activity_status not null default 'pending',
  unique (event_id, position)
);

create table public.event_tables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  table_number text not null,
  capacity integer check (capacity > 0),
  notes text,
  unique (event_id, table_number)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  table_id uuid references public.event_tables(id) on delete set null,
  name text not null,
  whatsapp text,
  status public.guest_status not null default 'pending',
  notes text
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  event_id uuid references public.events(id) on delete set null,
  movement_type public.stock_movement_type not null,
  quantity numeric(12,2) not null check (quantity > 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.recalculate_quote_totals()
returns trigger language plpgsql as $$
declare
  target_quote_id uuid;
begin
  target_quote_id := coalesce(new.quote_id, old.quote_id);
  update public.quotes
  set subtotal = coalesce((select sum(line_total) from public.quote_items where quote_id = target_quote_id), 0),
      total = greatest(0, coalesce((select sum(line_total) from public.quote_items where quote_id = target_quote_id), 0) - discount + additional_fee)
  where id = target_quote_id;
  return coalesce(new, old);
end;
$$;

create or replace function public.create_event_when_quote_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed') then
    insert into public.events (quote_id, client_id, name, venue, event_date, event_time)
    values (new.id, new.client_id, new.name, new.venue, new.event_date, new.event_time)
    on conflict (quote_id) do nothing;
    new.confirmed_at = coalesce(new.confirmed_at, now());
  end if;
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger services_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger inventory_items_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger quotes_updated_at before update on public.quotes for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger quote_items_totals after insert or update or delete on public.quote_items for each row execute function public.recalculate_quote_totals();
create trigger quotes_confirmed before update of status on public.quotes for each row execute function public.create_event_when_quote_confirmed();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.inventory_items enable row level security;
alter table public.service_materials enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.events enable row level security;
alter table public.ceremonial_activities enable row level security;
alter table public.event_tables enable row level security;
alter table public.guests enable row level security;
alter table public.inventory_movements enable row level security;

create policy "authenticated users can read profiles" on public.profiles for select to authenticated using (true);
create policy "users can update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "authenticated users can manage clients" on public.clients for all to authenticated using (true) with check (true);
create policy "authenticated users can manage services" on public.services for all to authenticated using (true) with check (true);
create policy "authenticated users can manage inventory" on public.inventory_items for all to authenticated using (true) with check (true);
create policy "authenticated users can manage service materials" on public.service_materials for all to authenticated using (true) with check (true);
create policy "authenticated users can manage quotes" on public.quotes for all to authenticated using (true) with check (true);
create policy "authenticated users can manage quote items" on public.quote_items for all to authenticated using (true) with check (true);
create policy "authenticated users can manage events" on public.events for all to authenticated using (true) with check (true);
create policy "authenticated users can manage ceremonial activities" on public.ceremonial_activities for all to authenticated using (true) with check (true);
create policy "authenticated users can manage event tables" on public.event_tables for all to authenticated using (true) with check (true);
create policy "authenticated users can manage guests" on public.guests for all to authenticated using (true) with check (true);
create policy "authenticated users can manage inventory movements" on public.inventory_movements for all to authenticated using (true) with check (true);

create index quotes_client_id_idx on public.quotes(client_id);
create index quotes_status_idx on public.quotes(status);
create index events_event_date_idx on public.events(event_date);
create index guests_event_id_idx on public.guests(event_id);
create index inventory_movements_item_idx on public.inventory_movements(inventory_item_id);