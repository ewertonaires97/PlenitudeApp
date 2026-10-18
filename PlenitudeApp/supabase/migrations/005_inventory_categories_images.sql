insert into storage.buckets (id, name, public)
values ('inventory-images', 'inventory-images', true)
on conflict (id) do update set public = true;

create table if not exists public.inventory_images (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_category_links (
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  category_id uuid not null references public.inventory_categories(id) on delete cascade,
  primary key (inventory_item_id, category_id)
);

insert into public.inventory_categories (name)
values ('Louças'), ('Talheres'), ('Toalhas'), ('Taças'), ('Itens decorativos'), ('Bases e Suportes'), ('Sousplat')
on conflict (name) do nothing;

alter table public.inventory_images enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.inventory_category_links enable row level security;

create policy "authenticated users can manage inventory images"
on public.inventory_images for all to authenticated using (true) with check (true);
create policy "authenticated users can manage inventory categories"
on public.inventory_categories for all to authenticated using (true) with check (true);
create policy "authenticated users can manage inventory category links"
on public.inventory_category_links for all to authenticated using (true) with check (true);

create policy "public can view inventory images"
on storage.objects for select to public using (bucket_id = 'inventory-images');
create policy "authenticated users can upload inventory images"
on storage.objects for insert to authenticated with check (bucket_id = 'inventory-images');
create policy "authenticated users can update inventory images"
on storage.objects for update to authenticated using (bucket_id = 'inventory-images') with check (bucket_id = 'inventory-images');
create policy "authenticated users can delete inventory images"
on storage.objects for delete to authenticated using (bucket_id = 'inventory-images');

create index if not exists inventory_images_item_id_idx on public.inventory_images(inventory_item_id);
create index if not exists inventory_category_links_category_id_idx on public.inventory_category_links(category_id);