-- ===========================================================================
--  Tudo Sobre Nada — banco de dados compartilhado (Supabase)
--
--  Como usar (uma vez só):
--    1. Crie um projeto em https://supabase.com/dashboard
--    2. Abra "SQL Editor" -> "New query" -> cole este arquivo -> "Run"
--    3. Copie a URL e a chave anon para assets/config.js
--
--  O site não usa login: qualquer pessoa escolhe um nome e publica. Por isso
--  as políticas abaixo liberam leitura e escrita. Se um dia você quiser
--  limitar isso (ex.: só moderadores podem apagar), é aqui que se mexe.
-- ===========================================================================

-- ---------------------------------------------------------------------------
--  Perfis
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           text primary key,
  name         text not null,
  username     text not null,
  avatar       text,
  hue          text,
  avatar_image text,
  created_at   bigint not null default 0
);

-- ---------------------------------------------------------------------------
--  Posts
--
--  A pontuação NÃO fica aqui: ela é a soma das linhas da tabela votes.
--  (A coluna votes do post antigo guardava o "+1" automático e foi
--  removida de propósito.)
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id         text primary key,
  kind       text not null default 'texto',
  board      text not null,
  author     text not null,
  title      text not null,
  body       text not null default '',
  tags       text[] not null default '{}',
  votes      integer not null default 0,   -- legado: ignorado pelo site
  created_at bigint not null default 0,
  media      jsonb not null default '[]'::jsonb,
  slides     jsonb not null default '[]'::jsonb,
  links      jsonb not null default '[]'::jsonb
);

-- ---------------------------------------------------------------------------
--  Comentários (respostas usam parent_id)
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id         text primary key,
  post_id    text not null references public.posts(id) on delete cascade,
  parent_id  text,
  author     text,
  body       text not null default '',
  votes      integer not null default 0,   -- legado: ignorado pelo site
  created_at bigint not null default 0
);

-- ---------------------------------------------------------------------------
--  Votos (uma linha por pessoa por post/comentário)
-- ---------------------------------------------------------------------------
create table if not exists public.votes (
  voter   text not null,
  post_id text not null references public.posts(id) on delete cascade,
  value   integer not null,
  primary key (voter, post_id)
);

create table if not exists public.comment_votes (
  voter      text not null,
  comment_id text not null references public.comments(id) on delete cascade,
  value      integer not null,
  primary key (voter, comment_id)
);

-- ---------------------------------------------------------------------------
--  Índices
-- ---------------------------------------------------------------------------
create index if not exists posts_created_at_idx   on public.posts (created_at desc);
create index if not exists posts_author_idx       on public.posts (author);
create index if not exists comments_post_id_idx   on public.comments (post_id);
create index if not exists comments_parent_id_idx on public.comments (parent_id);

-- ---------------------------------------------------------------------------
--  A coluna votes dos posts/comentários é legada: o site não usa mais
--  (a pontuação é a soma das linhas da tabela votes). Ela fica para não
--  quebrar versões antigas do site que ainda enviam o campo.
-- ---------------------------------------------------------------------------
alter table public.posts    add column if not exists votes integer not null default 0;
alter table public.comments add column if not exists votes integer not null default 0;

-- ---------------------------------------------------------------------------
--  Storage: um bucket público para as imagens e os vídeos
--
--  O id do bucket pode ser um UUID (se ele foi criado pelo painel), por isso
--  a política usa a função beam_bucket_id() em vez do nome fixo.
--  (O mesmo trecho está em supabase-storage.sql, para rodar separado.)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
select 'post-media', 'post-media', true, 26214400
where not exists (select 1 from storage.buckets where name = 'post-media')
on conflict (id) do update set public = true;

update storage.buckets
   set public = true,
       file_size_limit = 26214400
 where name = 'post-media';

create or replace function public.beam_bucket_id()
returns text
language sql
stable
security definer
set search_path = public
as $$ select id::text from storage.buckets where name = 'post-media' limit 1 $$;

revoke all on function public.beam_bucket_id() from public;
grant execute on function public.beam_bucket_id() to anon, authenticated;

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
--  Políticas (RLS): leitura e escrita liberadas — o site não tem login.
-- ---------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.posts        enable row level security;
alter table public.comments     enable row level security;
alter table public.votes        enable row level security;
alter table public.comment_votes enable row level security;

drop policy if exists "public read"   on public.profiles;
drop policy if exists "public insert" on public.profiles;
drop policy if exists "public update" on public.profiles;
drop policy if exists "public delete" on public.profiles;
create policy "public read"   on public.profiles for select using (true);
create policy "public insert" on public.profiles for insert with check (true);
create policy "public update" on public.profiles for update using (true) with check (true);
create policy "public delete" on public.profiles for delete using (true);

drop policy if exists "public read"   on public.posts;
drop policy if exists "public insert" on public.posts;
drop policy if exists "public update" on public.posts;
drop policy if exists "public delete" on public.posts;
create policy "public read"   on public.posts for select using (true);
create policy "public insert" on public.posts for insert with check (true);
create policy "public update" on public.posts for update using (true) with check (true);
create policy "public delete" on public.posts for delete using (true);

drop policy if exists "public read"   on public.comments;
drop policy if exists "public insert" on public.comments;
drop policy if exists "public update" on public.comments;
drop policy if exists "public delete" on public.comments;
create policy "public read"   on public.comments for select using (true);
create policy "public insert" on public.comments for insert with check (true);
create policy "public update" on public.comments for update using (true) with check (true);
create policy "public delete" on public.comments for delete using (true);

drop policy if exists "public read"   on public.votes;
drop policy if exists "public insert" on public.votes;
drop policy if exists "public update" on public.votes;
drop policy if exists "public delete" on public.votes;
create policy "public read"   on public.votes for select using (true);
create policy "public insert" on public.votes for insert with check (true);
create policy "public update" on public.votes for update using (true) with check (true);
create policy "public delete" on public.votes for delete using (true);

drop policy if exists "public read"   on public.comment_votes;
drop policy if exists "public insert" on public.comment_votes;
drop policy if exists "public update" on public.comment_votes;
drop policy if exists "public delete" on public.comment_votes;
create policy "public read"   on public.comment_votes for select using (true);
create policy "public insert" on public.comment_votes for insert with check (true);
create policy "public update" on public.comment_votes for update using (true) with check (true);
create policy "public delete" on public.comment_votes for delete using (true);
