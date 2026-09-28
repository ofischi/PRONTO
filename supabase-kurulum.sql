-- =====================================================================
-- PRONTO — Supabase kurulumu (SQL Editor'da bir kez çalıştırın; tekrar çalıştırmak güvenlidir)
-- Tek tablo: her kayıt bir satır. Sadece değişen satırlar gider/gelir.
-- Güvenlik: RLS + sunucu tarafı doğrulama + oturum başına yazma sınırı.
-- =====================================================================

create table if not exists public.pt_rows (
  tbl        text        not null,
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tbl, id)
);
create index if not exists pt_rows_updated_idx on public.pt_rows (updated_at);

-- ---------- Sunucu tarafı doğrulama (tablo seviyesinde, istemci atlatamaz) ----------
alter table public.pt_rows drop constraint if exists pt_rows_tbl_chk;
alter table public.pt_rows add constraint pt_rows_tbl_chk
  check (tbl in ('cariler','personeller','urunler','teklifler','odemeler','odeme_yontemleri','photo','meta','variant'));
alter table public.pt_rows drop constraint if exists pt_rows_id_chk;
alter table public.pt_rows add constraint pt_rows_id_chk
  check (char_length(id) between 1 and 200 and id !~ '[[:cntrl:]<>]');
alter table public.pt_rows drop constraint if exists pt_rows_data_chk;
alter table public.pt_rows add constraint pt_rows_data_chk
  check ((deleted and data is null) or (not deleted and jsonb_typeof(data) = 'object'));

-- Oturum başına dakikalık yazma sayacı (sadece sunucu fonksiyonları erişir)
create table if not exists public.pt_rate (
  sid text primary key,
  win timestamptz not null,
  n   integer not null
);
alter table public.pt_rate enable row level security;
revoke all on public.pt_rate from public, anon, authenticated;

-- Her yazmada: boyut sınırı + hız sınırı + sunucu saati
create or replace function public.pt_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sid   text := coalesce(auth.jwt() ->> 'session_id', auth.uid()::text, 'yok');
  v_win   timestamptz := date_trunc('minute', now());
  v_n     integer;
  v_limit constant integer := 600;   -- oturum başına dakikada en fazla 600 satır yazma
begin
  if new.deleted then
    new.data := null;
  elsif pg_column_size(new.data) > (case when new.tbl = 'photo' then 1500000 else 300000 end) then
    raise exception 'Kayıt çok büyük' using errcode = '22023';
  end if;

  insert into public.pt_rate as r (sid, win, n) values (v_sid, v_win, 1)
  on conflict (sid) do update
    set n   = case when r.win = excluded.win then r.n + 1 else 1 end,
        win = excluded.win
  returning n into v_n;
  if v_n > v_limit then
    raise exception 'Çok fazla istek. Lütfen bir dakika bekleyin.' using errcode = 'PT429';
  end if;

  new.updated_at := clock_timestamp();   -- zamanı istemci değil sunucu belirler
  return new;
end $$;
revoke all on function public.pt_guard() from public, anon, authenticated;

drop trigger if exists pt_rows_touch on public.pt_rows;
drop function if exists public.pt_touch();
drop trigger if exists pt_rows_guard on public.pt_rows;
create trigger pt_rows_guard before insert or update on public.pt_rows
  for each row execute function public.pt_guard();

-- ---------- Numara sayacı: sadece izinli adlar, parametreli ----------
create table if not exists public.pt_counters (name text primary key, value bigint not null default 0);
alter table public.pt_counters enable row level security;
revoke all on public.pt_counters from public, anon, authenticated;

create or replace function public.next_seq(p_name text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if p_name is null or p_name not in ('teklif', 'urun') then
    raise exception 'Geçersiz sayaç' using errcode = '22023';
  end if;
  insert into public.pt_counters (name, value) values (p_name, 1)
  on conflict (name) do update set value = public.pt_counters.value + 1
  returning value into v;
  return v;
end $$;
revoke all on function public.next_seq(text) from public, anon;
grant execute on function public.next_seq(text) to authenticated;

-- ---------- Erişim: yalnızca giriş yapmış (ortak şifreyi bilen) kullanıcı ----------
alter table public.pt_rows enable row level security;
drop policy if exists "pt_rows ekip" on public.pt_rows;
create policy "pt_rows ekip" on public.pt_rows for all to authenticated using (true) with check (true);
revoke all on public.pt_rows from public, anon, authenticated;
grant select, insert, update on public.pt_rows to authenticated;   -- DELETE yok: silme = deleted işareti

-- ---------- Realtime: sadece Broadcast, özel kanal ----------
drop policy if exists "pronto yayin dinle" on realtime.messages;
create policy "pronto yayin dinle" on realtime.messages for select to authenticated
  using (realtime.topic() = 'pronto');
drop policy if exists "pronto yayin gonder" on realtime.messages;
create policy "pronto yayin gonder" on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'pronto');

-- (İsteğe bağlı, ayda bir elle) 90 günden eski silinmiş satır izlerini temizle:
-- delete from public.pt_rows where deleted and updated_at < now() - interval '90 days';
