create table if not exists bot_state (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
);
create table if not exists guild_snapshots (
    guild_id text primary key,
    data jsonb not null,
    updated_at timestamptz not null default now()
);
alter table bot_state enable row level security;
alter table guild_snapshots enable row level security;

grant usage on schema public to service_role;
grant all on table bot_state, guild_snapshots to service_role;
