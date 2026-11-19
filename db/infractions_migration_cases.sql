alter table infractions
    add column if not exists reason text,
    add column if not exists case_number integer,
    add column if not exists message_content text,
    add column if not exists evidence_urls text[] not null default '{}',
    add column if not exists status text not null default 'active',
    add column if not exists voided_by text,
    add column if not exists voided_at timestamptz,
    add column if not exists void_reason text;

-- number rows by created_at, per guild
update infractions i
set case_number = n.rn
from (
    select id, row_number() over (partition by guild_id order by created_at, id) as rn
    from infractions
) n
where i.id = n.id and i.case_number is null;

alter table infractions alter column case_number set not null;

create unique index if not exists infractions_guild_case_idx on infractions (guild_id, case_number);
create index if not exists infractions_guild_moderator_idx on infractions (guild_id, moderator_id);

grant usage on schema public to service_role;
grant all on table infractions to service_role;
