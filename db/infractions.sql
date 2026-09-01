create table infractions (
    id uuid primary key default gen_random_uuid(),
    guild_id text not null,
    target_user_id text not null,
    moderator_id text not null,
    rule_id text,
    rule_text_snapshot text,
    action_type text not null,
    message_link text,
    created_at timestamptz not null default now()
);

create index infractions_guild_target_idx on infractions (guild_id, target_user_id);

alter table infractions enable row level security;
