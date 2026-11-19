create table if not exists message_index (
    guild_id text not null,
    message_id text not null,
    channel_id text not null,
    user_id text not null,
    has_attachments boolean not null default false,
    created_at timestamptz not null,
    primary key (guild_id, message_id)
);
create index if not exists message_index_user_idx on message_index (guild_id, user_id, created_at);
alter table message_index enable row level security;

-- ban decisions; save attachments or not
create table if not exists pending_bans (
    id uuid primary key default gen_random_uuid(),
    guild_id text not null,
    case_number integer not null,
    target_user_id text not null,
    moderator_id text,
    refs jsonb not null default '[]',
    delete_after boolean not null default false,
    status text not null default 'awaiting',
    prompt_channel_id text,
    prompt_message_id text,
    deadline timestamptz not null,
    created_at timestamptz not null default now()
);
create index if not exists pending_bans_status_idx on pending_bans (status, deadline);
alter table pending_bans enable row level security;

grant usage on schema public to service_role;
grant all on table message_index, pending_bans to service_role;
