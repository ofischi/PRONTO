-- =====================================================================
-- PRONTO — Supabase kurulumu (SQL Editor'da bir kez çalıştırın)
-- Tek tablo: her kayıt bir satır. Sadece değişen satırlar gider/gelir.
-- =====================================================================

create table if not exists public.pt_rows (
  tbl        text        not null,
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tbl, id)
);
-- "son eşitlemeden beri değişenler" sorgusu için
create index if not exists pt_rows_updated_idx on public.pt_rows (updated_at);

-- updated_at'i istemci değil sunucu belirler
create or replace function public.pt_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists pt_rows_touch on public.pt_rows;
create trigger pt_rows_touch before insert or update on public.pt_rows
  for each row execute function public.pt_touch();

-- Teklif / ürün numaraları: 10 kişi aynı anda kaydetse de çakışmaz
create table if not exists public.pt_counters (name text primary key, value bigint not null default 0);
create or replace function public.next_seq(p_name text) returns bigint
language sql security definer set search_path = public as $$
  insert into public.pt_counters(name, value) values (p_name, 1)
  on conflict (name) do update set value = public.pt_counters.value + 1
  returning value;
$$;
revoke all on function public.next_seq(text) from public, anon;
grant execute on function public.next_seq(text) to authenticated;

-- Güvenlik: yalnızca giriş yapmış (ortak şifreyi bilen) kullanıcı okur/yazar
alter table public.pt_rows enable row level security;
alter table public.pt_counters enable row level security;
drop policy if exists "pt_rows ekip" on public.pt_rows;
create policy "pt_rows ekip" on public.pt_rows for all to authenticated using (true) with check (true);
revoke all on public.pt_rows from anon;
revoke all on public.pt_counters from anon, authenticated;

-- Realtime: sadece Broadcast (özel kanal). Veritabanı değişiklik dinleme YOK,
-- bu yüzden sürekli çalışan sorgu/log oluşmaz.
drop policy if exists "pronto yayin dinle" on realtime.messages;
create policy "pronto yayin dinle" on realtime.messages for select to authenticated
  using (realtime.topic() = 'pronto');
drop policy if exists "pronto yayin gonder" on realtime.messages;
create policy "pronto yayin gonder" on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'pronto');

-- (İsteğe bağlı) 90 günden eski silinmiş satır izlerini temizlemek için ara sıra elle çalıştırın:
-- delete from public.pt_rows where deleted and updated_at < now() - interval '90 days';
