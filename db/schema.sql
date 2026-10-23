-- TODO mate cloud sync schema (Neon Postgres). Idempotent: safe to run again.
-- Apply with: npm run db:migrate   (needs DATABASE_URL in the environment)

-- One row per account. The id is the Google account's stable "sub" claim.
create table if not exists users (
  id           text primary key,
  email        text not null,
  name         text,
  picture      text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Every category / todo / settings object a user has, one row each.
-- updated_at is the client's edit time (ms) and decides conflicts (last write wins).
-- seq increases on every accepted write; devices pull "everything after my last seq".
create sequence if not exists records_seq;

create table if not exists records (
  user_id    text    not null references users (id) on delete cascade,
  kind       text    not null check (kind in ('goal', 'todo', 'settings')),
  id         text    not null,
  data       jsonb,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  seq        bigint  not null default nextval('records_seq'),
  primary key (user_id, kind, id)
);

create index if not exists records_user_seq on records (user_id, seq);
