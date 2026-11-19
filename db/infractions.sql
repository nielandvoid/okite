create table infractions (
    id uuid primary key default gen_random_uuid(),
    guild_id text not null,
    case_number integer not null,
    target_user_id text not null,
    moderator_id text not null,
    rule_id text,
    rule_text_snapshot text,
    reason text,
    duration text,
    expires_at timestamptz,
    ended_at timestamptz,
    action_type text not null,
    message_link text,
    message_content text,
    evidence_urls text[] not null default '{}',
    status text not null default 'active',
    voided_by text,
    voided_at timestamptz,
    void_reason text,
    created_at timestamptz not null default now()
);

create unique index infractions_guild_case_idx on infractions (guild_id, case_number);
create index infractions_guild_target_idx on infractions (guild_id, target_user_id);
create index infractions_guild_moderator_idx on infractions (guild_id, moderator_id);
create index infractions_active_punishments_idx on infractions (action_type, ended_at, expires_at);

alter table infractions enable row level security;

-- service_role grants
grant usage on schema public to service_role;
grant all on table infractions to service_role;
