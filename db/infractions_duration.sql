alter table infractions
    add column if not exists duration text,
    add column if not exists expires_at timestamptz,
    add column if not exists ended_at timestamptz;

create index if not exists infractions_active_punishments_idx on infractions (action_type, ended_at, expires_at);
