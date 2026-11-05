create or replace function public.record_inventory_movement(
  target_item_id uuid,
  movement_kind public.stock_movement_type,
  movement_quantity numeric,
  movement_notes text default null
)
returns public.inventory_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  item public.inventory_items;
  next_quantity numeric(12,2);
begin
  if movement_quantity <= 0 then
    raise exception 'A quantidade deve ser maior que zero';
  end if;

  select * into item
  from public.inventory_items
  where id = target_item_id
  for update;

  if not found then
    raise exception 'Item de estoque não encontrado';
  end if;

  next_quantity := case movement_kind
    when 'in' then item.quantity + movement_quantity
    when 'out' then item.quantity - movement_quantity
    when 'adjustment' then movement_quantity
  end;

  if next_quantity < 0 then
    raise exception 'O estoque não pode ficar negativo';
  end if;

  update public.inventory_items
  set quantity = next_quantity
  where id = target_item_id
  returning * into item;

  insert into public.inventory_movements (inventory_item_id, movement_type, quantity, notes, created_by)
  values (target_item_id, movement_kind, movement_quantity, movement_notes, auth.uid());

  return item;
end;
$$;