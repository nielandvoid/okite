-- messages, 72h
create table if not exists message_cache (
    guild_id text not null,
    message_id text not null,
    channel_id text not null,
    author_id text not null,
    author_name text,
    content text,
    attachments jsonb not null default '[]',
    embeds integer not null default 0,
    stickers jsonb not null default '[]',
    reply_to text,
    created_at timestamptz not null,
    primary key (guild_id, message_id)
);
create index if not exists message_cache_created_idx on message_cache (created_at);
alter table message_cache enable row level security;

grant usage on schema public to service_role;
grant all on table message_cache to service_role;
