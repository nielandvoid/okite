const { PermissionFlagsBits: P, ChannelType, GuildVerificationLevel, GuildExplicitContentFilter, GuildMFALevel, GuildDefaultMessageNotifications, OverwriteType } = require('discord.js');

const ORDER = ['critical', 'high', 'medium', 'low'];

const ROLE_PERMS = [
    ['Administrator', P.Administrator, 'critical'],
    ['Manage Server', P.ManageGuild, 'high'],
    ['Manage Roles', P.ManageRoles, 'high'],
    ['Manage Channels', P.ManageChannels, 'high'],
    ['Manage Webhooks', P.ManageWebhooks, 'high'],
    ['Ban Members', P.BanMembers, 'high'],
    ['Kick Members', P.KickMembers, 'high'],
    ['Mention Everyone', P.MentionEveryone, 'high'],
    ['Moderate Members', P.ModerateMembers, 'medium'],
    ['Manage Messages', P.ManageMessages, 'medium'],
    ['Manage Threads', P.ManageThreads, 'medium'],
    ['Manage Nicknames', P.ManageNicknames, 'medium'],
    ['Manage Expressions', P.ManageGuildExpressions, 'medium'],
    ['Manage Events', P.ManageEvents, 'medium'],
    ['View Audit Log', P.ViewAuditLog, 'medium'],
    ['Create Invite', P.CreateInstantInvite, 'low']
];

const CHANNEL_PERMS = [
    ['Manage Channels', P.ManageChannels, 'high'],
    ['Manage Permissions', P.ManageRoles, 'high'],
    ['Manage Webhooks', P.ManageWebhooks, 'high'],
    ['Mention Everyone', P.MentionEveryone, 'medium'],
    ['Manage Messages', P.ManageMessages, 'medium'],
    ['Manage Threads', P.ManageThreads, 'medium'],
    ['Mute Members', P.MuteMembers, 'medium'],
    ['Deafen Members', P.DeafenMembers, 'medium'],
    ['Move Members', P.MoveMembers, 'medium'],
    ['Create Invite', P.CreateInstantInvite, 'low']
];

const NEEDED = [
    ['Ban Members', P.BanMembers],
    ['Kick Members', P.KickMembers],
    ['Moderate Members', P.ModerateMembers],
    ['Manage Messages', P.ManageMessages],
    ['Manage Channels', P.ManageChannels],
    ['Manage Nicknames', P.ManageNicknames],
    ['View Audit Log', P.ViewAuditLog],
    ['Read Message History', P.ReadMessageHistory]
];

const PRIVATE_NAME = /(^|[^a-z])(mod|mods|moderator|staff|admin|admins|log|logs|audit|private|team|internal|reports?)([^a-z]|$)/i;
const PUBLIC_ONLY_NAME = /(rules?|announce|announcements|news|info|welcome|faq|updates)/i;
const rank = (sev) => ORDER.indexOf(sev);
const worst = (list) => list.reduce((w, s) => (rank(s) < rank(w) ? s : w), 'low');
const list = (perms) => perms.map(p => p[0]).join(', ');
const cap = (arr, n = 12) => (arr.length > n ? [...arr.slice(0, n), `…and ${arr.length - n} more`] : arr);

async function auditGuild(guild, { logChannelIds = [] } = {}) {
    const findings = [];
    const unchecked = [];
    const add = (sev, area, title, lines = []) => findings.push({ sev, area, title, lines });

    const me = await guild.members.fetchMe().catch(() => null);
    const roles = [...(await guild.roles.fetch()).values()];
    const channels = [...(await guild.channels.fetch()).values()].filter(Boolean);
    const everyone = guild.roles.everyone;
    const myTop = me?.roles.highest;
    const myPos = myTop?.position ?? -1;
    const staffRoles = roles.filter(r => r.id !== everyone.id && !r.managed && r.id !== myTop?.id);

    const heldBy = {};
    if (guild.memberCount <= 1500) {
        const members = await guild.members.fetch().catch(() => null);
        if (members) roles.forEach(r => { heldBy[r.id] = r.members.size; });
        else unchecked.push('role member counts (members could not be fetched)');
    } else {
        unchecked.push('role member counts (server has more than 1500 members)');
    }
    const holders = (r) => (r.id in heldBy ? `${heldBy[r.id]} member${heldBy[r.id] === 1 ? '' : 's'}` : null);

    const evHits = ROLE_PERMS.filter(([, flag]) => everyone.permissions.has(flag, false));
    if (evHits.length) {
        add(worst(evHits.map(h => h[2])), 'roles', '@everyone holds privileged permissions', [`every member can: ${list(evHits)}`]);
    }

    const adminRoles = staffRoles.filter(r => r.permissions.has(P.Administrator));
    const escalated = staffRoles.map(r => ({ role: r, hits: ROLE_PERMS.filter(([, flag]) => r.permissions.has(flag, false)).filter(h => h[0] !== 'Create Invite') }))
        .filter(e => e.hits.length && !e.role.permissions.has(P.Administrator));

    for (const [label, test] of [['below okite', (r) => r.position < myPos], ['above okite', (r) => r.position >= myPos]]) {
        const admins = adminRoles.filter(test);
        const others = escalated.filter(e => test(e.role));
        if (admins.length) {
            add('high', 'roles', `roles with Administrator ${label} (${admins.length})`, cap(admins.map(r => `${r.name}${holders(r) ? ` / ${holders(r)}` : ''}${r.mentionable ? ' / mentionable' : ''}`)));
        }
        if (others.length) {
            const sev = worst(others.flatMap(e => e.hits.map(h => h[2])));
            add(sev === 'critical' ? 'high' : sev, 'roles', `roles with escalated permissions ${label} (${others.length})`,
                cap(others.map(e => `${e.role.name}${holders(e.role) ? ` / ${holders(e.role)}` : ''}: ${list(e.hits)}`)));
        }
    }

    const roleManagers = staffRoles.filter(r => r.permissions.has(P.ManageRoles) && !r.permissions.has(P.Administrator));
    const paths = [];
    for (const m of roleManagers) {
        const reachable = adminRoles.filter(a => a.position < m.position);
        if (reachable.length) paths.push(`${m.name} can hand out ${reachable.map(a => a.name).join(', ')}`);
    }
    if (paths.length) add('critical', 'roles', 'privilege escalation: Manage Roles above an Administrator role', cap(paths));

    const botAdmins = roles.filter(r => r.managed && r.tags?.botId && r.permissions.has(P.Administrator) && r.tags.botId !== guild.client.user.id);
    if (botAdmins.length) add('high', 'roles', `other bots with Administrator (${botAdmins.length})`, cap(botAdmins.map(r => r.name)));

    const lure = staffRoles.filter(r => r.mentionable && ROLE_PERMS.some(([n, f, s]) => rank(s) <= rank('high') && n !== 'Create Invite' && r.permissions.has(f, false)));
    if (lure.length) add('low', 'roles', `mentionable roles that carry privileged permissions (${lure.length})`, cap(lure.map(r => r.name)));

    if (adminRoles.length > 3) add('medium', 'roles', `${adminRoles.length} roles have Administrator`, ['keep it to as few as possible; give specific permissions instead']);

    if (me) {
        const perms = me.permissions;
        if (perms.has(P.Administrator)) {
            add('medium', 'okite', 'okite itself has Administrator', ['it only needs ban, kick, timeout, manage messages and channels, view audit log; a compromised token would own the server']);
        } else {
            const missing = NEEDED.filter(([, f]) => !perms.has(f));
            if (missing.length) add('medium', 'okite', 'okite is missing permissions', [list(missing)]);
        }
        const above = staffRoles.filter(r => r.position >= myPos && r.id !== myTop.id && ROLE_PERMS.some(([n, f]) => ['Ban Members', 'Kick Members', 'Moderate Members', 'Manage Messages'].includes(n) && r.permissions.has(f, false)));
        if (above.length) add('low', 'okite', `moderator roles above okite (${above.length}): okite can't act on their members`, cap(above.map(r => r.name)));
    }

    const server = [];
    if (guild.verificationLevel === GuildVerificationLevel.None) server.push(['high', 'verification level is None: anyone can join and post immediately']);
    else if (guild.verificationLevel === GuildVerificationLevel.Low) server.push(['medium', 'verification level is Low: only a verified email is needed']);
    if (guild.explicitContentFilter === GuildExplicitContentFilter.Disabled) server.push(['medium', 'explicit media filter is off']);
    else if (guild.explicitContentFilter === GuildExplicitContentFilter.MembersWithoutRoles) server.push(['low', 'explicit media filter only scans members without roles']);
    if (guild.mfaLevel === GuildMFALevel.None && (adminRoles.length || escalated.length)) server.push(['high', 'staff permissions are held without requiring 2FA for moderation actions']);
    if (guild.defaultMessageNotifications === GuildDefaultMessageNotifications.AllMessages && guild.memberCount > 500) server.push(['low', 'default notifications are set to all messages']);
    for (const [sev, line] of server) add(sev, 'server', line);

    const invites = await guild.invites.fetch().catch(() => null);
    if (invites) {
        const loose = [...invites.values()].filter(i => !i.maxAge && !i.maxUses && !i.temporary);
        const human = loose.filter(i => i.inviter && !i.inviter.bot);
        if (human.length > 3) add('medium', 'server', `${human.length} permanent unlimited invites made by members`, cap(human.map(i => `${i.code} / ${i.inviter.username} / ${i.uses} uses`)));
        else if (loose.length > 10) add('low', 'server', `${loose.length} permanent unlimited invites`, []);
    } else unchecked.push('invites (needs Manage Server)');

    const hooks = await guild.fetchWebhooks().catch(() => null);
    if (hooks) {
        const made = [...hooks.values()].filter(h => h.owner && !h.owner.bot);
        if (made.length) add('medium', 'server', `webhooks made by members (${made.length}): anyone holding the URL can post as them`, cap(made.map(h => `${h.name} / #${guild.channels.cache.get(h.channelId)?.name ?? h.channelId} / ${h.owner.username}`)));
    } else unchecked.push('webhooks (needs Manage Webhooks)');

    const widget = await guild.fetchWidgetSettings().catch(() => null);
    if (widget?.enabled) add('low', 'server', 'server widget is enabled: it publishes your channel and online member list');
    else if (!widget) unchecked.push('widget (needs Manage Server)');

    const named = (c) => `#${c.name}`;
    const cats = new Map(channels.filter(c => c.type === ChannelType.GuildCategory).map(c => [c.id, c]));
    const bare = channels.filter(c => c.type !== ChannelType.GuildCategory && !c.isThread?.());
    const everyoneCan = (c, flag) => c.permissionsFor(everyone)?.has(flag, false);

    const sensitive = bare.filter(c => PRIVATE_NAME.test(c.name) || logChannelIds.includes(c.id) || (c.parent && PRIVATE_NAME.test(c.parent.name)));
    const exposed = sensitive.filter(c => everyoneCan(c, P.ViewChannel));
    if (exposed.length) add('high', 'channels', `staff or log channels visible to @everyone (${exposed.length})`, cap(exposed.map(named)));

    for (const id of logChannelIds) {
        const c = guild.channels.cache.get(id);
        if (!c || !me) continue;
        const p = c.permissionsFor(me);
        if (!p?.has(P.ViewChannel) || !p.has(P.SendMessages)) add('medium', 'channels', `okite cannot write in its log channel ${named(c)}`, []);
    }

    const opened = [];
    for (const c of bare) {
        const parent = c.parentId ? cats.get(c.parentId) : null;
        if (parent && !parent.permissionsFor(everyone).has(P.ViewChannel, false) && everyoneCan(c, P.ViewChannel)) opened.push(`${named(c)} in ${parent.name}`);
    }
    if (opened.length) add('high', 'channels', `channels that open up a private category to @everyone (${opened.length})`, cap(opened));

    const delegated = [];
    const dangerous = [];
    for (const c of channels) {
        for (const ow of c.permissionOverwrites?.cache.values() ?? []) {
            const target = ow.type === OverwriteType.Role ? guild.roles.cache.get(ow.id) : null;
            const targetName = ow.id === everyone.id ? '@everyone' : (target ? target.name : (guild.members.cache.get(ow.id)?.user.username ?? ow.id));
            const hits = CHANNEL_PERMS.filter(([, flag]) => ow.allow.has(flag));
            if (!hits.length) continue;
            const isUser = ow.type === OverwriteType.Member;
            if (ow.id === everyone.id) {
                dangerous.push({ sev: worst(hits.map(h => h[2])), line: `${named(c)}: @everyone allowed ${list(hits)}` });
            } else if (hits.some(h => ['Manage Channels', 'Manage Permissions', 'Manage Webhooks'].includes(h[0])) && (isUser || !(target?.permissions.has(P.ManageChannels)))) {
                delegated.push(`${named(c)}: ${isUser ? 'user ' : ''}${targetName} allowed ${list(hits.filter(h => ['Manage Channels', 'Manage Permissions', 'Manage Webhooks'].includes(h[0])))}`);
            }
        }
    }
    if (dangerous.length) add(worst(dangerous.map(d => d.sev)), 'channels', `channel overrides that give @everyone privileged permissions (${dangerous.length})`, cap(dangerous.map(d => d.line)));
    if (delegated.length) add('medium', 'channels', `channel-level management delegated by override (${delegated.length})`, cap(delegated));

    const postable = bare.filter(c => (c.id === guild.rulesChannelId || c.id === guild.publicUpdatesChannelId || c.type === ChannelType.GuildAnnouncement || PUBLIC_ONLY_NAME.test(c.name)) && c.isTextBased?.() && everyoneCan(c, P.SendMessages));
    if (postable.length) add('medium', 'channels', `read-only style channels where @everyone can send (${postable.length})`, cap(postable.map(named)));

    const memberOverrides = bare.filter(c => [...(c.permissionOverwrites?.cache.values() ?? [])].some(o => o.type === OverwriteType.Member));
    if (memberOverrides.length > 8) add('low', 'channels', `${memberOverrides.length} channels use per-user overrides, which are easy to forget`, cap(memberOverrides.map(named)));

    findings.sort((a, b) => rank(a.sev) - rank(b.sev));
    const counts = Object.fromEntries(ORDER.map(s => [s, findings.filter(f => f.sev === s).length]));
    return { findings, counts, unchecked, stats: { roles: roles.length, channels: channels.length } };
}

function reportText(guild, result) {
    const out = [`security audit: ${guild.name} (${guild.id})`, `${result.stats.roles} roles, ${result.stats.channels} channels`, `critical ${result.counts.critical} / high ${result.counts.high} / medium ${result.counts.medium} / low ${result.counts.low}`, ''];
    for (const f of result.findings) {
        out.push(`[${f.sev}] ${f.area}: ${f.title}`);
        f.lines.forEach(l => out.push(`    - ${l}`));
    }
    if (!result.findings.length) out.push('nothing flagged.');
    if (result.unchecked.length) out.push('', `could not check: ${result.unchecked.join('; ')}`);
    return out.join('\n') + '\n';
}

module.exports = { auditGuild, reportText, ORDER };
