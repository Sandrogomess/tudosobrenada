-- ===========================================================================
--  Storage: bucket público + permissão de enviar/apagar arquivos
--
--  USE ESTE ARQUIVO se o envio de imagem/vídeo falhar com:
--    "new row violates row-level security policy"  (ou "Unauthorized")
--
--  Como usar: SQL Editor -> New query -> cole -> Run. Pode rodar quantas
--  vezes quiser (não quebra nada).
-- ===========================================================================

-- ---------------------------------------------------------------------------
--  1. Garante que existe um bucket público chamado 'post-media'
--     (25 MB por arquivo, o mesmo limite do site).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
select 'post-media', 'post-media', true, 26214400
where not exists (select 1 from storage.buckets where name = 'post-media')
on conflict (id) do update set public = true;

update storage.buckets
   set public = true,
       file_size_limit = 26214400
 where name = 'post-media';

-- ---------------------------------------------------------------------------
--  2. Função que devolve o id do bucket.
--     O id pode ser um UUID (se o bucket foi criado pelo painel do Supabase),
--     por isso a política não pode escrever 'post-media' fixo.
--     SECURITY DEFINER: a função enxerga storage.buckets mesmo para quem
--     não tem permissão de leitura nessa tabela (o visitante anônimo).
-- ---------------------------------------------------------------------------
create or replace function public.beam_bucket_id()
returns text
language sql
stable
security definer
set search_path = public
as $$ select id::text from storage.buckets where name = 'post-media' limit 1 $$;

revoke all on function public.beam_bucket_id() from public;
grant execute on function public.beam_bucket_id() to anon, authenticated;

-- ---------------------------------------------------------------------------
--  3. Políticas do Storage: enviar e apagar arquivos do bucket.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
--  3. Políticas do Storage: ler, enviar, sobrescrever e apagar arquivos.
--     - "select" é precisa para o site conseguir sobrescrever e apagar
--       (o Storage consulta o arquivo antes de mexer nele);
--     - "update" é precisa porque o site sempre envia com "x-upsert".
-- ---------------------------------------------------------------------------
drop policy if exists "public select" on storage.objects;
drop policy if exists "public upload" on storage.objects;
drop policy if exists "public update" on storage.objects;
drop policy if exists "public remove" on storage.objects;

create policy "public select" on storage.objects
  for select using (bucket_id = public.beam_bucket_id());

create policy "public upload" on storage.objects
  for insert with check (bucket_id = public.beam_bucket_id());

create policy "public update" on storage.objects
  for update using (bucket_id = public.beam_bucket_id())
  with check (bucket_id = public.beam_bucket_id());

create policy "public remove" on storage.objects
  for delete using (bucket_id = public.beam_bucket_id());

-- ---------------------------------------------------------------------------
--  4. Diagnóstico: mostra o bucket e as políticas criadas.
-- ---------------------------------------------------------------------------
select id, name, public, file_size_limit
  from storage.buckets
 where name = 'post-media';

select policyname, cmd, qual
  from pg_policies
 where schemaname = 'storage'
   and tablename = 'objects';
