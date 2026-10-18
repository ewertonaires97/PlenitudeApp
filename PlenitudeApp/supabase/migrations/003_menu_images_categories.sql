insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

create table if not exists public.menu_images (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_category_links (
  menu_id uuid not null references public.menus(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete cascade,
  primary key (menu_id, category_id)
);

insert into public.menu_categories (name)
values ('Doces'), ('Salgados'), ('Bolos'), ('Bebidas'), ('Sobremesas'), ('Frutas')
on conflict (name) do nothing;

alter table public.menu_images enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_category_links enable row level security;

create policy "authenticated users can manage menu images"
on public.menu_images for all to authenticated using (true) with check (true);

create policy "authenticated users can manage menu categories"
on public.menu_categories for all to authenticated using (true) with check (true);

create policy "authenticated users can manage menu category links"
on public.menu_category_links for all to authenticated using (true) with check (true);

create policy "public can view menu images"
on storage.objects for select to public
using (bucket_id = 'menu-images');

create policy "authenticated users can upload menu images"
on storage.objects for insert to authenticated
with check (bucket_id = 'menu-images');

create policy "authenticated users can update menu images"
on storage.objects for update to authenticated
using (bucket_id = 'menu-images') with check (bucket_id = 'menu-images');

create policy "authenticated users can delete menu images"
on storage.objects for delete to authenticated
using (bucket_id = 'menu-images');

create index if not exists menu_images_menu_id_idx on public.menu_images(menu_id);
create index if not exists menu_category_links_category_id_idx on public.menu_category_links(category_id);