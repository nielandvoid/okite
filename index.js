const {
    Client, 
    GatewayIntentBits,
    Events,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder,
    Partials,
    AuditLogEvent,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
    MessageFlags,
    FileBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ComponentType
} = require("discord.js"); require("dotenv").config();

const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end('okite online')).listen(PORT, () => {
    console.log(`http server listening on port ${PORT}`);
});

const FULL_INTENTS = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates
];
const LIMITED_INTENTS = FULL_INTENTS.filter(i => i !== GatewayIntentBits.GuildMembers && i !== GatewayIntentBits.MessageContent);
const clientOptions = { failIfNotExists: false, partials: [Partials.Message, Partials.Channel] };
let client = new Client({ ...clientOptions, intents: FULL_INTENTS });

const mongoose = require('mongoose');
const Guild = require('./models/guild');

if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('connected to mongodb database'))
        .catch(err => console.error('mongodb connection error:', err));
}

const { createClient } = require('@supabase/supabase-js');
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

const rules = require('./rules.json')
const fs = require('fs');
let config = require('./config.json');

const nodePath = require('path');
const DATA_DIR = process.env.OKITE_DATA_DIR || nodePath.join(__dirname, 'data');
const SPOOL_FILE = nodePath.join(DATA_DIR, 'spool.json');
const STATE_FILE = nodePath.join(DATA_DIR, 'state.json');

let stateTimer = null;
let lastSeenLocal = null;
function saveState() {
    clearTimeout(stateTimer);
    stateTimer = setTimeout(saveStateNow, 1000);
    stateTimer.unref();
}
function saveStateNow() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify({ marks: [...markedpurgestarts], lastSeen: lastSeenLocal }));
    } catch (err) {
        console.error('could not save state:', err.message);
    }
}

// mod-id -> purge range start; data/state.json
class PersistedMap extends Map {
    set(key, value) { super.set(key, { ...value, at: value?.at ?? Date.now() }); saveState(); return this; }
    delete(key) { const had = super.delete(key); saveState(); return had; }
}
const markedpurgestarts = new PersistedMap();
try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    lastSeenLocal = saved.lastSeen ?? null;
    for (const [key, value] of saved.marks || []) {
        if (Date.now() - (value.at ?? 0) < 6 * 3600e3) Map.prototype.set.call(markedpurgestarts, key, value);
    }
} catch (err) {
    if (err.code !== 'ENOENT') console.error('could not read saved state:', err.message);
}

const suppressedDeletes = new Set();

const COLORS = { brand: 0xf1ede4, info: 0x6fa8ff, action: 0xffe27a, danger: 0xff8b9a, good: 0x7ee8a8, muted: 0xc49bff };

const LOG_KINDS = {
    general: 'logChannelId',
    citation: 'citationChannelId',
    purge: 'purgeChannelId',
    moderation: 'moderationChannelId',
    messages: 'messagesChannelId',
    members: 'membersChannelId',
    voice: 'voiceChannelId',
    server: 'serverChannelId'
};

const guildConfigCache = new Map();
const GUILD_CONFIG_TTL_MS = 60 * 1000;

async function getCachedGuildConfig(guildId) {
    const hit = guildConfigCache.get(guildId);
    if (hit && Date.now() - hit.at < GUILD_CONFIG_TTL_MS) return hit.doc;
    const doc = await Guild.findOne({ guildId }).lean();
    guildConfigCache.set(guildId, { at: Date.now(), doc });
    return doc;
}

async function getLogChannel(guild, kind = 'general') {
    const key = LOG_KINDS[kind] || LOG_KINDS.general;
    const guildConfig = process.env.MONGODB_URI ? await getCachedGuildConfig(guild.id) : null;

    const resolve = (k) => (guildConfig && guildConfig[k]) || config[k] || (k === 'logChannelId' ? process.env.LOG_CHANNEL_ID : null);
    const id = resolve(key) || resolve('logChannelId');

    const writable = (c) => c && c.isTextBased?.() && typeof c.send === 'function';
    let logChannel = id ? guild.channels.cache.get(id) : null;
    if (!writable(logChannel)) {
        logChannel = guild.channels.cache.find(c => writable(c) && (c.name === 'logs' || c.name === 'mod-logs'));
    }
    return writable(logChannel) ? logChannel : null;
}

function logInBackground(guild, payload) {
    sendLog(guild, payload).catch(err => console.error('log write error:', err));
}

const sentenceCase = (text) => (text ? (text.charAt(0).toUpperCase() + text.slice(1)).replace(/\bids\b/gi, 'IDs').replace(/\bid\b/gi, 'ID') : text);
const AVATAR_FIELDS = ['user', 'author', 'cited user', 'target', 'replied to'];

const cut = (text, n) => (text.length > n ? text.slice(0, n - 1) + '…' : text);

function codeBlock(text) {
    return ['```', ...text.replace(/```/g, '`\u200b``').split('\n'), '```'].map(l => `> ${l}`).join('\n');
}

const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const prettyTimes = (text) => String(text).replace(ISO_TIME, (iso) => `<t:${Math.floor(Date.parse(iso) / 1000)}:f>`);

function renderLogEmbed({ title, color = COLORS.info, description, fields = [], kind = 'general', media = [] }) {
    const valid = fields.filter(f => f && f.value !== undefined && f.value !== null && f.value !== '');
    const isShort = (f) => !f.code && !f.section && (f.inline || (String(f.value).length <= 70 && !String(f.value).includes('\n')));
    const quoted = valid.filter(isShort).map(f => `> **${sentenceCase(String(f.name))}:** ${prettyTimes(String(f.value).slice(0, 300))}${f.detail ? `\n${String(f.detail).slice(0, 900).split('\n').map(l => `> ${l}`).join('\n')}` : ''}`);
    const sections = valid.filter(f => !isShort(f)).map(f => `**${sentenceCase(String(f.name))}**\n${f.code ? codeBlock(cut(String(f.value), 1500)) : (f.quote ? String(f.value).slice(0, 1000).split('\n').map(l => `> ${l}`).join('\n') : String(f.value).slice(0, 1000))}`);
    let body = [description, quoted.join('\n'), ...sections].filter(Boolean).join('\n\n').slice(0, 4000);
    const padding = Number(process.env.EMBED_PAD_WIDTH) || 0;
    if (padding > 0) body += `\n${'\u2800'.repeat(Math.min(padding, 200))}`;

    const embed = new EmbedBuilder()
        .setTitle(sentenceCase(title).slice(0, 256))
        .setColor(color)
        .setTimestamp();
    if (body) embed.setDescription(body);
    if (media[0]) embed.setImage(String(media[0].url ?? media[0]));

    const person = valid.find(f => AVATAR_FIELDS.includes(String(f.name).toLowerCase()) && /<@!?(\d+)>/.test(String(f.value)));
    const id = person && String(person.value).match(/<@!?(\d+)>/)[1];
    const avatar = id && client.users.cache.get(id)?.displayAvatarURL?.();
    if (avatar) embed.setThumbnail(avatar);

    const mod = valid.find(f => String(f.name).toLowerCase() === 'moderator' && /<@!?(\d+)>/.test(String(f.value)));
    if (mod) {
        const modId = String(mod.value).match(/<@!?(\d+)>/)[1];
        const cached = client.users.cache.get(modId);
        const name = cached?.username ?? String(mod.value).match(/\(`([^`]+)`/)?.[1];
        embed.setFooter({ text: `Performed by ${name ?? modId}`, iconURL: cached?.displayAvatarURL?.() });
    }
    return embed;
}

// containers; CONTAINERS=off = embeds
const USE_CONTAINERS = process.env.CONTAINERS !== 'off';
const V2_FLAG = MessageFlags.IsComponentsV2;
const BANNER_NAME = 'okite_visual.png';
const okiteIcon = () => client.user?.displayAvatarURL?.({ extension: 'png', size: 256 });
const bannerFile = () => new AttachmentBuilder(nodePath.join(__dirname, BANNER_NAME), { name: BANNER_NAME });
const textBlock = (content) => new TextDisplayBuilder().setContent(content);
const divider = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
function containerHeader(container, content, thumbnailUrl) {
    if (thumbnailUrl) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(textBlock(content)).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl)));
    else container.addTextDisplayComponents(textBlock(content));
    return container;
}
const noticeContainer = (content, color = COLORS.muted) => new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(textBlock(content));
const asMessage = ({ total, ...payload }) => payload;

const MESSAGE_TEXT_BUDGET = 3800;
const PLACEHOLDER_REASONS = new Set(['not specified', 'no reason given', 'banned (no reason given)']);

// log layout: title, details, content, files, footer
function renderLogContainer({ title, color = COLORS.info, description, fields = [], transcriptNames = [], media = [], attached = [] }) {
    const valid = fields.filter(f => f && f.value !== undefined && f.value !== null && f.value !== '');
    const isMain = (f) => f.code || (String(f.name).toLowerCase() === 'reason' && !PLACEHOLDER_REASONS.has(String(f.value).toLowerCase()));
    const isShort = (f) => !isMain(f) && !f.section && (f.inline || (String(f.value).length <= 70 && !String(f.value).includes('\n')));
    const quoted = valid.filter(isShort).map(f => `> **${sentenceCase(String(f.name))}:** ${prettyTimes(String(f.value).slice(0, 300))}${f.detail ? `\n${String(f.detail).slice(0, 900).split('\n').map(l => `> ${l}`).join('\n')}` : ''}`);
    const sections = valid.filter(f => !isShort(f)).map(f => ({ label: sentenceCase(String(f.name)), value: String(f.value), code: isMain(f), quote: !!f.quote }));

    const person = valid.find(f => AVATAR_FIELDS.includes(String(f.name).toLowerCase()) && /<@!?(\d+)>/.test(String(f.value)));
    const id = person && String(person.value).match(/<@!?(\d+)>/)[1];
    const avatar = (id && client.users.cache.get(id)?.displayAvatarURL?.()) || okiteIcon();

    const mod = valid.find(f => String(f.name).toLowerCase() === 'moderator' && /<@!?(\d+)>/.test(String(f.value)));
    let by = '';
    if (mod) {
        const modId = String(mod.value).match(/<@!?(\d+)>/)[1];
        const name = client.users.cache.get(modId)?.username ?? String(mod.value).match(/\(`([^`]+)`/)?.[1];
        by = `Performed by ${name ?? modId} / `;
    }
    const footer = `-# ${by}<t:${Math.floor(Date.now() / 1000)}:f>`;

    const head = [`## ${sentenceCase(title).slice(0, 200)}`, description, quoted.join('\n')].filter(Boolean).join('\n');
    const render = (sec) => (sec.code ? `**${sec.label}**\n${codeBlock(sec.text)}` : `**${sec.label}**\n${sec.quote ? sec.text.split('\n').map(l => `> ${l}`).join('\n') : sec.text}`);
    const parts = sections.map(sec => ({ ...sec, text: sec.value }));
    const total = (h) => h.length + footer.length + parts.reduce((n, p) => n + render(p).length, 0);
    let headText = head;
    for (let guard = 0; total(headText) > MESSAGE_TEXT_BUDGET && guard < 40; guard++) {
        const longest = parts.reduce((best, p) => (!best || p.text.length > best.text.length ? p : best), null);
        if (longest && longest.text.length > 200 && longest.text.length >= headText.length) longest.text = cut(longest.text, Math.max(200, longest.text.length - Math.ceil((total(headText) - MESSAGE_TEXT_BUDGET) * 1.1) - 4));
        else headText = cut(headText, Math.max(300, headText.length - (total(headText) - MESSAGE_TEXT_BUDGET) - 2));
    }

    const container = containerHeader(new ContainerBuilder().setAccentColor(color), headText, avatar);
    for (const part of parts) container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(render(part)));
    if (media.length || attached.length) container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock('**Preview**'));
    if (media.length) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(...media.slice(0, 10).map(m => { const item = new MediaGalleryItemBuilder().setURL(String(m.url ?? m)).setSpoiler(true); const alt = String(m.description || '').slice(0, 1000); return alt ? item.setDescription(alt) : item; })));
    const cards = [...attached, ...transcriptNames];
    if (cards.length) {
        if (!(media.length || attached.length)) container.addSeparatorComponents(divider());
        container.addFileComponents(...cards.map(name => new FileBuilder().setURL(`attachment://${name}`)));
    }
    container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(footer));
    return container;
}

// md transcript; code fence = longest backtick run in text + 1
function markdownTranscript({ title, description, fields = [], file }) {
    const runs = file.content.match(/`+/g) || [];
    const fence = '`'.repeat(Math.max(3, ...runs.map(r => r.length + 1)));
    const details = fields
        .filter(f => f && f.value !== undefined && f.value !== null && f.value !== '' && String(f.name).toLowerCase() !== 'preview')
        .map(f => `- **${sentenceCase(String(f.name))}:** ${String(f.value).replace(/\n+/g, ' ')}${f.detail ? `\n${String(f.detail).split('\n').map(l => `  ${l}`).join('\n')}` : ''}`);
    return [`# ${sentenceCase(title)}`, description, details.join('\n'), '## Transcript', `${fence}text\n${file.content}\n${fence}`].filter(Boolean).join('\n\n') + '\n';
}

function logButtons(fields, jumpUrl) {
    const row = new ActionRowBuilder();
    if (jumpUrl) row.addComponents(new ButtonBuilder().setLabel('Jump to message').setStyle(ButtonStyle.Link).setURL(String(jumpUrl)));
    const person = fields.find(f => f && AVATAR_FIELDS.includes(String(f.name).toLowerCase()) && /<@!?(\d+)>/.test(String(f.value)));
    const id = person && String(person.value).match(/<@!?(\d+)>/)[1];
    if (id) row.addComponents(new ButtonBuilder().setCustomId(`logid:${id}`).setLabel('Get User-ID').setStyle(ButtonStyle.Secondary));
    return jumpUrl || id ? row : null;
}

async function sendLog(guild, entry) {
    const { file, kind = 'general' } = entry;
    const logChannel = await getLogChannel(guild, kind).catch(err => {
        console.error('log channel lookup error:', err);
        return null;
    });
    if (!logChannel) return true;

    const fields = entry.fields || [];
    const jump = fields.find(f => String(f?.name).toLowerCase() === 'jump' && /^https?:\/\//.test(String(f.value)));
    const uploads = entry.uploads || [];
    const remoteImages = (entry.media || []).filter(m => m.image).map(m => ({ url: m.url, description: m.alt }));
    const shown = {
        ...entry,
        fields: fields.filter(f => f !== jump),
        media: [...uploads.filter(u => u.image).map(u => ({ url: `attachment://${u.name}`, description: u.alt })), ...remoteImages],
        attached: uploads.filter(u => !u.image).map(u => u.name),
        transcriptNames: []
    };
    const buttons = logButtons(fields, jump?.value);
    const transcript = file ? [
        new AttachmentBuilder(Buffer.from(file.content, 'utf8'), { name: file.name }),
        new AttachmentBuilder(Buffer.from(markdownTranscript({ ...entry, file }), 'utf8'), { name: file.name.replace(/\.txt$/i, '') + '.md' })
    ] : [];
    shown.transcriptNames = transcript.map(t => t.name);
    const uploaded = uploads.map(u => new AttachmentBuilder(u.buffer, { name: u.name }));
    const files = [...uploaded, ...transcript];
    const useContainer = USE_CONTAINERS && entry.embed !== true;
    let payload;
    if (useContainer) {
        payload = { flags: MessageFlags.IsComponentsV2, components: [renderLogContainer(shown), ...(buttons ? [buttons] : [])], allowedMentions: { parse: [] } };
    } else {
        payload = { embeds: [renderLogEmbed(shown)], allowedMentions: { parse: [] } };
        if (buttons) payload.components = [buttons];
    }
    if (files.length) payload.files = files;

    let sent = await logChannel.send(payload).catch(err => {
        console.error('log send error:', err.message);
        return null;
    });
    // container fails -> send embed
    if (!sent && useContainer) {
        const fallback = { embeds: [renderLogEmbed(shown)], allowedMentions: { parse: [] }, ...(buttons ? { components: [buttons] } : {}), ...(files.length ? { files } : {}) };
        sent = await logChannel.send(fallback).catch(err => { console.error('log send error (embed fallback):', err.message); return null; });
    }
    return !!sent;
}

const who = (user) => user ? `<@${user.id}> (\`${user.tag ?? user.username}\` / ${user.id})` : 'unknown';
const clip = (text, n = 1000) => (text && text.length > n) ? text.slice(0, n - 1) + '…' : (text || '');

const caseCounters = new Map();

const OPTIONAL_COLUMNS = ['reason', 'duration', 'expires_at', 'ended_at'];
const missingColumns = new Set();
const missingColumnName = (error) => {
    const m = (error?.message || '').match(/'(\w+)' column|column "?(\w+)"?/i);
    return m ? (m[1] || m[2]) : null;
};
const isMissingColumn = (error) => ['PGRST204', '42703'].includes(error?.code) || /column .*(reason|duration|expires_at|ended_at)/i.test(error?.message || '');
setInterval(() => missingColumns.clear(), 60 * 60 * 1000).unref();
const timedColumnsMissing = () => missingColumns.has('expires_at') || missingColumns.has('ended_at');
const withoutMissingColumns = (row) => {
    const out = { ...row };
    for (const col of missingColumns) {
        if (!(col in out)) continue;
        const value = out[col];
        delete out[col];
        if (col === 'reason' && value) out.rule_text_snapshot = `${out.rule_text_snapshot}\n\nreason: ${value}`;
        if (col === 'duration' && value) out.rule_text_snapshot = `${out.rule_text_snapshot}\n\nduration: ${value}`;
    }
    return out;
};

async function caseFloor(guildId) {
    try {
        const { data } = await supabase.from('bot_state').select('value').eq('key', `case_floor:${guildId}`).maybeSingle();
        return Number(data?.value?.last) || 0;
    } catch { return 0; }
}

async function raiseCaseFloor(guildId, number) {
    if (number <= await caseFloor(guildId)) return;
    const { error } = await supabase.from('bot_state').upsert({ key: `case_floor:${guildId}`, value: { last: number }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) console.error('case floor error:', error.message);
}

// number = last + 1 per guild; collision -> retry
async function createInfraction(row) {
    if (!supabase) return null;
    for (let attempt = 0; attempt < 5; attempt++) {
        let last = attempt === 0 ? caseCounters.get(row.guild_id) : undefined;
        if (last === undefined) {
            const { data, error } = await supabase
                .from('infractions')
                .select('case_number')
                .eq('guild_id', row.guild_id)
                .order('case_number', { ascending: false })
                .limit(1);
            if (error) {
                console.error('infraction number lookup error:', error);
                return null;
            }
            last = Math.max(data?.[0]?.case_number ?? 0, await caseFloor(row.guild_id));
        }
        const next = last + 1;
        caseCounters.set(row.guild_id, next);
        const { data, error } = await supabase
            .from('infractions')
            .insert({ ...withoutMissingColumns(row), case_number: next })
            .select()
            .single();
        if (!error) return data;
        caseCounters.delete(row.guild_id);
        const missing = isMissingColumn(error) ? missingColumnName(error) : null;
        if (missing && OPTIONAL_COLUMNS.includes(missing) && !missingColumns.has(missing) && missing in row) {
            console.error(`infractions.${missing} column is missing; run db/infractions_reason.sql and db/infractions_duration.sql. working without it for now.`);
            missingColumns.add(missing);
            continue;
        }
        if (error.code !== '23505') {
            console.error('infraction insert error:', error);
            return null;
        }
    }
    return null;
}

async function getInfraction(guildId, caseNumber) {
    const { data, error } = await supabase
        .from('infractions')
        .select('*')
        .eq('guild_id', guildId)
        .eq('case_number', caseNumber)
        .maybeSingle();
    if (error) console.error('infraction fetch error:', error);
    return data || null;
}

const unixTs = (iso) => Math.floor(new Date(iso).getTime() / 1000);

const DURATION_UNITS = { s: 1000, m: 60e3, h: 3600e3, d: 86400e3, w: 604800e3 };
const PERMANENT_WORDS = new Set(['perm', 'permanent', 'permanently', 'forever', 'indefinite']);
// timeout max 28d; mute > 28d = renewed
const MAX_TIMEOUT_MS = 28 * 86400e3 - 3600e3;

function formatDuration(ms) {
    const parts = [];
    let left = Math.round(ms / 1000);
    for (const [name, sec] of [['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]) {
        const n = Math.floor(left / sec);
        if (n) { parts.push(`${n} ${name}${n > 1 ? 's' : ''}`); left -= n * sec; }
    }
    return parts.slice(0, 2).join(' and ') || '0 seconds';
}

function parseDuration(token) {
    const t = String(token ?? '').trim().toLowerCase();
    if (!t) return null;
    if (PERMANENT_WORDS.has(t)) return { permanent: true, ms: null, label: 'Permanent' };
    if (!/^(?:\d+(?:\.\d+)?[smhdw])+$/.test(t)) return null;
    let ms = 0;
    for (const [, n, unit] of t.matchAll(/(\d+(?:\.\d+)?)([smhdw])/g)) ms += Number(n) * DURATION_UNITS[unit];
    return ms >= 1000 ? { permanent: false, ms, label: formatDuration(ms) } : null;
}

const durationColumns = (d) => (d && !d.permanent ? { duration: d.label, expires_at: new Date(Date.now() + d.ms).toISOString() } : {});

const BAD_DURATION = 'that isn\'t a duration. use something like `30m`, `12h`, `7d`, `2w`, `1d12h`, or `permanent`.';

async function resolveRuleFields(guildId, ruleInput, reasonText) {
    const reason = reasonText || 'not specified';
    if (!ruleInput && (await getAutoPurge(guildId)).requireRule) {
        return { error: 'this server requires a rule: give a rule id, or `custom` with a reason. try `/rule list`.' };
    }
    if (!ruleInput || ruleInput.toLowerCase() === 'custom') return { ruleId: null, snapshot: reason, reasonColumn: null, reason };
    const all = await getServerRules(guildId);
    const rule = all.find(r => r.id.toLowerCase() === ruleInput.toLowerCase());
    if (!rule) return { error: `rule \`${ruleInput}\` not found. use \`custom\` or one of: ${all.map(r => `\`${r.id}\``).join(', ')}` };
    return { ruleId: rule.id, snapshot: rule.text, reasonColumn: reason, reason };
}

const INFRACTIONS_PER_PAGE = 8;

const infractionStats = (total, sum, issued = false) => [
    `**${issued ? 'issued' : 'net'}:** ${total}`,
    `**active:** ${sum.active} / ${total}`,
    `**voided:** ${sum.voided} / ${total}`,
    ...(sum.last ? [`**last:** <t:${unixTs(sum.last.at)}:R> (#${sum.last.number})`] : []),
    ...(sum.top ? [`**${issued ? 'most-cited' : 'frequent-violation'}:** ${sum.top.replace(/`/g, '')}`] : [])
].join('\n');

function parseTimezone(input) {
    const text = String(input || '').trim().replace(/\s+/g, '');
    if (!text) return null;
    if (/^(utc|gmt|z)$/i.test(text)) return { zone: 'UTC' };
    const offset = text.match(/^(?:utc|gmt)?([+\-\u2212])(\d{1,2})(?::?(\d{2}))?$/i);
    if (offset) {
        const hours = Number(offset[2]);
        const minutes = Number(offset[3] || 0);
        const total = (offset[1] === '+' ? 1 : -1) * (hours * 60 + minutes);
        if (minutes > 59 || total < -12 * 60 || total > 14 * 60) return null;
        if (total === 0) return { zone: 'UTC' };
        const abs = Math.abs(total);
        return { zone: `UTC${total < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}` };
    }
    if (/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(text)) {
        try { new Intl.DateTimeFormat('en-GB', { timeZone: text }); } catch { return null; }
        return { zone: text.replace(/(^|[\/_])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase()) };
    }
    return null;
}

const DEFAULT_ZONE = (() => {
    const zone = process.env.LOG_TIMEZONE;
    if (!zone) return 'UTC';
    const parsed = parseTimezone(zone);
    if (!parsed) console.error(`LOG_TIMEZONE "${zone}" is not a time zone; using UTC`);
    return parsed?.zone || 'UTC';
})();

const zoneFormatters = new Map();
function zoneParts(date, zone = DEFAULT_ZONE) {
    const fixed = zone.match(/^UTC([+-])(\d{2}):(\d{2})$/);
    if (zone === 'UTC' || fixed) {
        const shift = fixed ? (fixed[1] === '+' ? 1 : -1) * (Number(fixed[2]) * 60 + Number(fixed[3])) * 60000 : 0;
        const d = new Date(date.getTime() + shift);
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() };
    }
    if (!zoneFormatters.has(zone)) zoneFormatters.set(zone, new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
    const parts = Object.fromEntries(zoneFormatters.get(zone).formatToParts(date).map(p => [p.type, Number(p.value)]));
    return parts;
}
const pad2 = (n) => String(n).padStart(2, '0');
const clockText = (date, zone) => { const p = zoneParts(date, zone); return `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`; };
const fmtDate = (iso, zone) => { const p = zoneParts(new Date(iso), zone); return `${pad2(p.day)}/${pad2(p.month)}/${p.year}`; };
async function getTimezone(guildId) {
    return (await getAutoPurge(guildId).catch(() => null))?.timezone || DEFAULT_ZONE;
}
const plainRuleText = (text) => String(text ?? '')
    .replace(/^\s*>>>\s?/, '')
    .split('\n').map(line => line.replace(/^\s*>\s?/, '')).join('\n')
    .trim();
const listify = (text) => text.split('\n').map(line => line.replace(/^(\s*)(?:[\u2022\u2013\u2014\u2023\u25AA]\s*|[-*+]\s+)(\S.*)$/, '$1- $2')).join('\n');
const quotedRuleText = (text, max = 500) => clip(listify(plainRuleText(text)), max).split('\n').map(l => (l ? `> ${l}` : '>')).join('\n');
const stripRulePrefix = (label) => (label ? label.replace(/^rule\s*[\w.]+\s*:\s*/i, '').trim() : label);

const INFRACTION_TYPES = { lookup: 'warn', manual: 'warn', ban: 'ban', kick: 'kick', softban: 'softban', mute: 'mute' };
const NBSP = '\u00A0';
// nbsp joins pieces; word joiner blocks a break after the hyphen
const WORD_JOINER = '\u2060';
const glue = (text) => text.replace(/- /g, `-${WORD_JOINER} `).replace(/ /g, NBSP);
const PHONE_COLUMNS = 30;
const SEPARATOR_WIDTH = 30;
const PAGE_CHAR_BUDGET = 3200;

// "a day" / "an hour" = 1d / 1h (sapph import)
const compactDuration = (label) => {
    if (!label || /^permanent$/i.test(label)) return 'Permanent';
    const parts = [...String(label).matchAll(/\b(\d+|an?)\s*(week|day|hour|minute|second)s?/gi)].map(m => `${/^an?$/i.test(m[1]) ? 1 : m[1]}${m[2][0].toLowerCase()}`);
    return parts.length ? parts.join(' ') : String(label).slice(0, 12);
};

// 40 components per message; entry + button = 3
const ENTRIES_PER_PAGE = 6;
const PLAIN_ENTRIES_PER_PAGE = 10;
const ENTRY_PAGE_BUDGET = 3000;

const ruleName = (id) => {
    const m = String(id).match(/^r(\d+)(?:_(\d+))?$/i);
    return m ? `rule ${m[1]}${m[2] ? `.${m[2]}` : ''}` : `rule ${id}`;
};
function infractionEntry(row, labels = {}, { showTarget = false } = {}) {
    const custom = !row.rule_id || row.rule_id === 'custom';
    const text = custom
        ? row.rule_text_snapshot
        : (row.reason && row.reason !== 'not specified' ? row.reason : stripRulePrefix(labels[row.rule_id]) || row.rule_text_snapshot);
    const type = INFRACTION_TYPES[row.action_type] || 'warn';
    const target = showTarget ? ` - <@${row.target_user_id}>` : '';
    const voided = row.status === 'voided' ? ' `VOIDED`' : '';
    const head = `**#${row.case_number}** [<t:${unixTs(row.created_at)}:d>] **${type.toUpperCase()}** - ${compactDuration(row.duration)}${voided}${target}`;
    const reason = plainText(String(text || 'not specified').replace(/\s+/g, ' ').trim());
    return { text: `${head}\n${custom ? reason : `${ruleName(row.rule_id)} - ${reason}`}`, number: row.case_number };
}

function paginateEntries(entries, perPage = ENTRIES_PER_PAGE) {
    const pages = [];
    let current = [];
    let size = 0;
    for (const entry of entries) {
        if (current.length && (current.length >= perPage || size + entry.text.length > ENTRY_PAGE_BUDGET)) {
            pages.push(current);
            current = [];
            size = 0;
        }
        current.push(entry);
        size += entry.text.length + 1;
    }
    if (current.length) pages.push(current);
    return pages;
}

function infractionSummary(total, sum, issued = false) {
    const counts = `**${total}** ${issued ? 'issued' : 'net'} / **${sum.active}** active / **${sum.voided}** voided`;
    return sum.last ? `${counts}\n-# last <t:${unixTs(sum.last.at)}:R> (#${sum.last.number})` : counts;
}

function addEntries(container, entries, { buttons = false } = {}) {
    entries.forEach((entry, i) => {
        if (i > 0) container.addSeparatorComponents(divider());
        if (buttons) {
            container.addSectionComponents(new SectionBuilder()
                .addTextDisplayComponents(textBlock(entry.text))
                .setButtonAccessory(new ButtonBuilder().setCustomId(`infact:view:${entry.number}`).setLabel('View').setStyle(ButtonStyle.Primary)));
        } else container.addTextDisplayComponents(textBlock(entry.text));
    });
}

function buildInfractionBlocks(rows, labels = {}, { showTarget = false, names = {}, zone } = {}) {
    const cells = rows.map(row => {
        const custom = !row.rule_id || row.rule_id === 'custom';
        const text = custom
            ? row.rule_text_snapshot
            : (row.reason && row.reason !== 'not specified' ? row.reason : stripRulePrefix(labels[row.rule_id]) || row.rule_text_snapshot);
        return {
            num: `#${row.case_number}`,
            date: fmtDate(row.created_at, zone),
            duration: compactDuration(row.duration),
            type: INFRACTION_TYPES[row.action_type] || 'warn',
            rule: custom ? 'r?:' : `${row.rule_id}:`,
            reason: String(text || 'not specified').replace(/[\s`]+/g, ' ').trim(),
            who: showTarget ? String(names[row.target_user_id] || row.target_user_id) : '',
            voided: row.status === 'voided'
        };
    });
    const wn = Math.max(...cells.map(c => c.num.length));
    const wd = Math.max(...cells.map(c => c.duration.length));

    return cells.map(c => {
        const meta = glue(`[${c.date}] ${c.num.padEnd(wn)} - ${c.duration.padEnd(wd)}`);
        const first = [meta, glue(`- ${c.type}`), ...(c.who ? [glue(`- ${c.who}`)] : []), ...(c.voided ? [glue('- voided')] : [])].join(' ');
        const head = `- ${c.rule}`;
        const body = `${head} ${c.reason}`;
        const second = body.length <= PHONE_COLUMNS
            ? glue(body)
            : (() => { const [word, ...rest] = c.reason.split(' '); return glue(`${head} ${word}`) + (rest.length ? ` ${rest.join(' ')}` : ''); })();
        return { lines: [`${first} ${second}`], voided: c.voided };
    });
}

function renderInfractionBlocks(blocks) {
    const separator = '-'.repeat(SEPARATOR_WIDTH);
    return '```\n' + blocks.map(b => b.lines.join('\n')).join(`\n${separator}\n`) + '\n```';
}

function paginateBlocks(blocks) {
    const pages = [];
    let current = [];
    let size = 0;
    for (const block of blocks) {
        const length = block.lines.join('\n').length + SEPARATOR_WIDTH + 2;
        if (current.length && (current.length >= INFRACTIONS_PER_PAGE || size + length > PAGE_CHAR_BUDGET)) {
            pages.push(current);
            current = [];
            size = 0;
        }
        current.push(block);
        size += length;
    }
    if (current.length) pages.push(current);
    return pages;
}

async function editInfractionReason(interaction, id, reason) {
    const row = await getInfraction(interaction.guildId, id);
    if (!row) return interaction.editReply(`infraction #${id} not found.`);

    const ruleAligned = row.rule_id && row.rule_id !== 'custom';
    let { error } = await supabase.from('infractions').update(ruleAligned ? { reason } : { rule_text_snapshot: reason }).eq('id', row.id);
    if (ruleAligned && isMissingColumn(error)) {
        ({ error } = await supabase.from('infractions').update({ rule_text_snapshot: reason }).eq('id', row.id));
    }
    if (error) {
        console.error('infraction edit error:', error);
        return interaction.editReply('failed to edit the infraction.');
    }
    logInBackground(interaction.guild, {
        title: `infraction #${id} edited`,
        kind: 'citation',
        fields: [
            { name: 'moderator', value: who(interaction.user), inline: true },
            { name: 'user', value: `<@${row.target_user_id}>`, inline: true },
            { name: 'before', value: clip(ruleAligned ? (row.reason || 'not specified') : row.rule_text_snapshot) },
            { name: 'after', value: clip(reason) }
        ]
    });
    return interaction.editReply(`infraction **#${id}** updated.`);
}

async function deleteInfraction(interaction, id) {
    const { guild, guildId } = interaction;
    const row = await getInfraction(guildId, id);
    if (!row) return interaction.editReply(`infraction #${id} not found.`);

    const type = INFRACTION_TYPES[row.action_type] || 'warn';
    const custom = !row.rule_id || row.rule_id === 'custom';
    const text = custom ? row.rule_text_snapshot : (row.reason && row.reason !== 'not specified' ? row.reason : row.rule_text_snapshot);
    const open = (row.action_type === 'ban' || row.action_type === 'mute') && !row.ended_at && row.status !== 'voided';
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('infdel_confirm').setLabel('Delete').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('infdel_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    const asked = await interaction.editReply({
        content: `delete infraction **#${id}** (${type} for <@${row.target_user_id}>: ${clip(String(text || 'not specified').replace(/\s+/g, ' '), 150)})?\nirreversible - infraction can't be restored; although it does get logged${open ? '\nthe ban / mute stays untouched; purges only the record' : ''}`,
        components: [buttons],
        allowedMentions: { parse: [] }
    });
    const answer = await asked.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 30000 }).catch(() => null);
    if (!answer || answer.customId === 'infdel_cancel') {
        return interaction.editReply({ content: answer ? 'cancelled.' : 'confirmation timed out, nothing deleted.', components: [] });
    }
    await answer.update({ content: 'deleting…', components: [] });

    const logged = await sendLog(guild, {
        title: `infraction #${id} deleted`,
        kind: 'citation',
        color: COLORS.danger,
        fields: [
            { name: 'moderator', value: who(interaction.user), inline: true },
            { name: 'user', value: `<@${row.target_user_id}> (${row.target_user_id})`, inline: true },
            { name: 'type', value: type, inline: true },
            { name: 'rule', value: custom ? 'custom' : ruleName(row.rule_id), inline: true },
            { name: 'duration', value: row.duration || 'Permanent', inline: true },
            { name: 'status', value: row.status || 'active', inline: true },
            { name: 'created', value: new Date(row.created_at).toISOString(), inline: true },
            { name: 'created by', value: `<@${row.moderator_id}>`, inline: true },
            { name: 'reason', value: String(text || 'not specified') }
        ]
    });
    if (!logged) return interaction.editReply({ content: 'could not write the log, so nothing was deleted.', components: [] });

    await raiseCaseFloor(guildId, id);
    const { error } = await supabase.from('infractions').delete().eq('guild_id', guildId).eq('case_number', id);
    if (error) {
        console.error('infraction delete error:', error);
        return interaction.editReply({ content: 'the delete failed, the infraction is still there.', components: [] });
    }
    return interaction.editReply({ content: `infraction **#${id}** deleted.`, components: [] });
}

async function setInfractionVoid(interaction, id, voiding, reason) {
    const row = await getInfraction(interaction.guildId, id);
    if (!row) return interaction.editReply(`infraction #${id} not found.`);
    if (voiding === (row.status === 'voided')) {
        return interaction.editReply(`infraction #${id} is already ${voiding ? 'voided' : 'active'}.`);
    }

    const update = voiding
        ? { status: 'voided', voided_by: interaction.user.id, voided_at: new Date().toISOString(), void_reason: reason }
        : { status: 'active', voided_by: null, voided_at: null, void_reason: null };
    const { error } = await supabase.from('infractions').update(update).eq('id', row.id);
    if (error) {
        console.error('infraction update error:', error);
        return interaction.editReply(`failed to ${voiding ? 'void' : 'restore'} the infraction.`);
    }
    logInBackground(interaction.guild, {
        title: `infraction #${id} ${voiding ? 'voided' : 'restored'}`,
        kind: 'citation',
        color: voiding ? COLORS.muted : COLORS.good,
        fields: [
            { name: 'moderator', value: who(interaction.user), inline: true },
            { name: 'user', value: `<@${row.target_user_id}>`, inline: true },
            { name: 'originally issued by', value: `<@${row.moderator_id}>`, inline: true },
            { name: 'reason', value: reason }
        ]
    });
    return interaction.editReply(`infraction **#${id}** ${voiding ? 'voided' : 'restored'}.`);
}

const botKicks = new Set();
const botUnbans = new Set();

const MOD_ACTIONS = {
    kick: { flag: PermissionFlagsBits.KickMembers, label: 'Kick Members' },
    softban: { flag: PermissionFlagsBits.BanMembers, label: 'Ban Members' },
    mute: { flag: PermissionFlagsBits.ModerateMembers, label: 'Timeout Members' },
    unmute: { flag: PermissionFlagsBits.ModerateMembers, label: 'Timeout Members' }
};

async function endPunishments(guildId, userId, actionType) {
    if (!supabase) return 0;
    const { data, error } = await supabase
        .from('infractions')
        .update({ ended_at: new Date().toISOString() })
        .eq('guild_id', guildId)
        .eq('target_user_id', userId)
        .eq('action_type', actionType)
        .is('ended_at', null)
        .select('id');
    if (error) {
        if (!isMissingColumn(error)) console.error('end punishments error:', error);
        return 0;
    }
    return data?.length ?? 0;
}

// unban inside 60s = softban
const SOFTBAN_WINDOW_MS = 60 * 1000;
const recentBans = new Map();

async function convertQuickBanToSoftban(guildId, userId) {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('infractions')
        .select('id, case_number, created_at')
        .eq('guild_id', guildId)
        .eq('target_user_id', userId)
        .eq('action_type', 'ban')
        .is('ended_at', null)
        .order('created_at', { ascending: false })
        .limit(5);
    if (error) {
        if (!isMissingColumn(error)) console.error('softban lookup error:', error);
        return null;
    }
    const row = (data || []).find(r => Date.now() - new Date(r.created_at).getTime() <= SOFTBAN_WINDOW_MS);
    if (!row) return null;
    let update = await supabase.from('infractions').update({ action_type: 'softban', ended_at: new Date().toISOString() }).eq('id', row.id);
    if (update.error && isMissingColumn(update.error)) update = await supabase.from('infractions').update({ action_type: 'softban' }).eq('id', row.id);
    if (update.error) { console.error('softban update error:', update.error); return null; }
    return row;
}

async function runModAction(interaction, kind) {
    const { options, guild, guildId } = interaction;
    const target = options.getUser('user');
    if (target.id === interaction.user.id || target.id === client.user.id) return interaction.editReply(`you can't ${kind} that user.`);

    const member = await guild.members.fetch(target.id).catch(() => null);
    if ((kind === 'kick' || kind === 'mute') && !member) return interaction.editReply('that user isn\'t in this server.');
    if (member && kind !== 'unmute') {
        const manageable = kind === 'kick' ? member.kickable : kind === 'mute' ? member.moderatable : member.bannable;
        if (!manageable) return interaction.editReply(`okite can't ${kind} that user (their top role is above okite's, or they own the server).`);
        if (guild.ownerId !== interaction.user.id && interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
            return interaction.editReply('their top role is as high as yours or higher.');
        }
    }

    const durationInput = kind === 'mute' ? options.getString('duration') : null;
    const duration = durationInput ? parseDuration(durationInput) : { permanent: true, ms: null, label: 'Permanent' };
    if (!duration) return interaction.editReply(BAD_DURATION);
    if (!duration.permanent && duration.ms < 10000) return interaction.editReply('a mute needs to be at least 10 seconds.');

    const key = `${guildId}:${target.id}`;
    const auditReason = (text) => `${interaction.user.tag ?? interaction.user.username}: ${text}`.slice(0, 500);

    if (kind === 'unmute') {
        const reason = options.getString('reason') || 'not specified';
        const wasTimedOut = !!(member?.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now());
        if (member && wasTimedOut) await member.timeout(null, auditReason(reason)).catch(err => console.error('unmute error:', err.message));
        const ended = await endPunishments(guildId, target.id, 'mute');
        if (!ended && !wasTimedOut) return interaction.editReply(`**${target.username}** isn't muted.`);
        logInBackground(guild, {
            title: 'member unmuted',
            kind: 'moderation',
            color: COLORS.good,
            fields: [
                { name: 'user', value: who(target), inline: true },
                { name: 'moderator', value: who(interaction.user), inline: true },
                { name: 'reason', value: reason }
            ]
        });
        return interaction.editReply(`unmuted **${target.username}**.`);
    }

    const resolved = await resolveRuleFields(guildId, options.getString('rule'), options.getString('reason'));
    if (resolved.error) return interaction.editReply(resolved.error);
    const reason = resolved.reason;
    const timed = !duration.permanent;
    const record = (action_type) => createInfraction({
        guild_id: guildId,
        target_user_id: target.id,
        moderator_id: interaction.user.id,
        rule_id: resolved.ruleId,
        rule_text_snapshot: resolved.snapshot,
        ...(resolved.reasonColumn ? { reason: resolved.reasonColumn } : {}),
        action_type,
        ...durationColumns(duration)
    });
    const tag = (infraction) => infraction ? ` (infraction #${infraction.case_number})` : '';
    const logFields = (infraction, byLabel) => [
        { name: 'user', value: who(target), inline: true },
        { name: byLabel, value: who(interaction.user), inline: true },
        { name: 'duration', value: duration.label, inline: true },
        { name: 'rule', value: resolved.ruleId ? `\`${resolved.ruleId}\`` : 'custom', inline: true },
        { name: 'reason', value: reason }
    ];

    if (kind === 'kick') {
        botKicks.add(key);
        try { await guild.members.kick(target, auditReason(reason)); }
        catch (err) { botKicks.delete(key); return interaction.editReply(`kick failed: ${err.message}`); }
        setTimeout(() => botKicks.delete(key), 30000).unref();
        const infraction = await record('kick');
        logInBackground(guild, { title: `member kicked${infraction ? `: infraction #${infraction.case_number}` : ''}`, kind: 'moderation', color: COLORS.danger, fields: logFields(infraction, 'moderator').filter(f => f.name !== 'duration') });
        return interaction.editReply(`kicked **${target.username}**${tag(infraction)}.`);
    }

    if (kind === 'mute') {
        try { await member.timeout(timed ? Math.min(duration.ms, MAX_TIMEOUT_MS) : MAX_TIMEOUT_MS, auditReason(reason)); }
        catch (err) { return interaction.editReply(`mute failed: ${err.message}`); }
        const infraction = await record('mute');
        logInBackground(guild, { title: `member muted${infraction ? `: infraction #${infraction.case_number}` : ''}`, kind: 'moderation', color: COLORS.danger, fields: logFields(infraction, 'moderator') });
        const longMute = !timed || duration.ms > MAX_TIMEOUT_MS;
        return interaction.editReply(
            `muted **${target.username}** for ${duration.label}${tag(infraction)}.` +
            (longMute && timedColumnsMissing() ? ' the database is missing the duration columns (run db/infractions_duration.sql), so this mute will not be renewed past 28 days.' : '')
        );
    }

    botBans.add(key);
    botUnbans.add(key);
    try { await guild.members.ban(target, { deleteMessageSeconds: 0, reason: auditReason(`softban: ${reason}`) }); }
    catch (err) { botBans.delete(key); botUnbans.delete(key); return interaction.editReply(`softban failed: ${err.message}`); }
    await guild.members.unban(target, auditReason('softban: lifting straight away')).catch(err => console.error('softban unban error:', err.message));
    setTimeout(() => { botBans.delete(key); botUnbans.delete(key); }, 30000).unref();
    const infraction = await record('softban');
    logInBackground(guild, { title: `member softbanned${infraction ? `: infraction #${infraction.case_number}` : ''}`, kind: 'moderation', color: COLORS.danger, fields: logFields(infraction, 'moderator').filter(f => f.name !== 'duration') });
    const logsOn = await messageLogsOn(guild.id);
    const logReady = logsOn && Boolean(await getLogChannel(guild, 'citation'));
    const askNoLog = infraction && supabase && logsOn && !logReady;
    await interaction.editReply({
        content: `softbanned **${target.username}**${tag(infraction)}. they can rejoin${!supabase ? '.' : !logsOn ? `. ${NO_LOGS_NOTE}` : logReady ? '; building the transcript of their messages now.' : `. ${NO_LOG_CHOICE}`}`,
        components: askNoLog ? [noLogButtons(target.id, infraction.case_number)] : []
    });
    if (infraction && supabase && logReady) {
        runBanSnapshot({
            guild, target, infraction, moderatorId: interaction.user.id, deleteAfter: true,
            notify: (text) => interaction.followUp({ content: text, ephemeral: true }).catch(() => null)
        }).catch(err => console.error('softban snapshot error:', err));
    }
}

const REMOVED_GUILD_GRACE_MS = 90 * 24 * 3600e3;
const GUILD_TABLES = ['infractions', 'message_index', 'message_cache', 'pending_bans', 'guild_snapshots'];

async function markGuildRemoved(guildId) {
    const { error } = await supabase.from('bot_state').upsert({ key: `guild_left:${guildId}`, value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) console.error('guild removal mark error:', error.message);
}

async function clearGuildRemoved(guildId) {
    await supabase.from('bot_state').delete().eq('key', `guild_left:${guildId}`);
}

async function deleteGuildData(guildId) {
    for (const buffer of [indexBuffer, cacheBuffer]) {
        for (let i = buffer.length - 1; i >= 0; i--) if (buffer[i].guild_id === guildId) buffer.splice(i, 1);
    }
    for (const table of GUILD_TABLES) {
        const { error } = await supabase.from(table).delete().eq('guild_id', guildId);
        if (error) throw new Error(`${table}: ${error.message}`);
    }
    await supabase.from('bot_state').delete().eq('key', `case_floor:${guildId}`);
    if (process.env.MONGODB_URI) await Guild.deleteOne({ guildId });
    guildConfigCache.delete(guildId);
}

async function sweepRemovedGuilds() {
    if (!supabase || !client.isReady() || client.guilds.cache.size === 0) return;
    const { data: known } = await supabase.from('guild_snapshots').select('guild_id');
    const { data: marks } = await supabase.from('bot_state').select('key, value').like('key', 'guild_left:%');
    const left = new Map((marks || []).map(m => [m.key.slice('guild_left:'.length), m.value?.at]));
    for (const { guild_id } of known || []) {
        if (client.guilds.cache.has(guild_id) || left.has(guild_id)) continue;
        await markGuildRemoved(guild_id);
        left.set(guild_id, new Date().toISOString());
    }
    for (const [guildId, at] of left) {
        if (client.guilds.cache.has(guildId)) { await clearGuildRemoved(guildId); continue; }
        if (Date.now() - new Date(at).getTime() < REMOVED_GUILD_GRACE_MS) continue;
        try {
            await deleteGuildData(guildId);
            await clearGuildRemoved(guildId);
            console.log(`deleted stored data for guild ${guildId} (removed more than 90 days ago)`);
        } catch (err) {
            console.error(`guild data deletion error for ${guildId}:`, err.message);
        }
    }
}

const muteRenewedAt = new Map();
// expiry sweep; unban, end mute, renew mute > 28d
async function sweepTimedPunishments() {
    if (!supabase || timedColumnsMissing()) return;
    const now = new Date();

    const { data: expired, error } = await supabase
        .from('infractions')
        .select('*')
        .in('action_type', ['ban', 'mute'])
        .is('ended_at', null)
        .lt('expires_at', now.toISOString())
        .limit(50);
    if (error) {
        if (!isMissingColumn(error)) console.error('timed punishment sweep error:', error.message);
        else missingColumns.add('expires_at');
        return;
    }
    for (const row of expired) {
        const guild = client.guilds.cache.get(row.guild_id);
        if (!guild) continue;
        try {
            if (row.action_type === 'ban') {
                const key = `${row.guild_id}:${row.target_user_id}`;
                botUnbans.add(key);
                setTimeout(() => botUnbans.delete(key), 30000).unref();
                await guild.members.unban(row.target_user_id, 'temporary ban expired').catch(err => { if (err.code !== 10026) throw err; });
            } else {
                const member = await guild.members.fetch(row.target_user_id).catch(() => null);
                if (member?.communicationDisabledUntilTimestamp > Date.now()) await member.timeout(null, 'mute expired');
            }
            await endPunishments(row.guild_id, row.target_user_id, row.action_type);
            logInBackground(guild, {
                title: row.action_type === 'ban' ? `ban expired: infraction #${row.case_number}` : `mute expired: infraction #${row.case_number}`,
                kind: 'moderation',
                color: COLORS.good,
                fields: [{ name: 'user', value: `<@${row.target_user_id}> (${row.target_user_id})`, inline: true }, { name: 'duration', value: row.duration || 'Permanent', inline: true }]
            });
        } catch (err) {
            console.error('could not lift expired punishment:', err.message);
        }
    }

    const { data: active } = await supabase.from('infractions').select('*').eq('action_type', 'mute').is('ended_at', null).limit(200);
    for (const row of active || []) {
        if (Date.now() - (muteRenewedAt.get(row.id) ?? 0) < 3 * 3600e3) continue;
        muteRenewedAt.set(row.id, Date.now());
        const guild = client.guilds.cache.get(row.guild_id);
        const member = guild && await guild.members.fetch(row.target_user_id).catch(() => null);
        if (!member) continue;
        const left = row.expires_at ? new Date(row.expires_at).getTime() - Date.now() : Infinity;
        if (left <= 0) continue;
        if (muteNeedsRenewal(row.expires_at, member.communicationDisabledUntilTimestamp ?? 0, Date.now())) {
            await member.timeout(Math.min(left, MAX_TIMEOUT_MS), 'renewing mute').catch(err => console.error('mute renewal error:', err.message));
        }
    }
}

// renew if intended end > timeout end
function muteNeedsRenewal(expiresAt, timeoutUntil, now) {
    const intendedEnd = expiresAt ? new Date(expiresAt).getTime() : Infinity;
    return intendedEnd > timeoutUntil + 60 * 1000 && timeoutUntil - now < 3 * 86400e3;
}

async function reapplyMutes(member) {
    if (!supabase || timedColumnsMissing()) return;
    const { data } = await supabase.from('infractions').select('*').eq('guild_id', member.guild.id).eq('target_user_id', member.id).eq('action_type', 'mute').is('ended_at', null).limit(5);
    for (const row of data || []) {
        const left = row.expires_at ? new Date(row.expires_at).getTime() - Date.now() : Infinity;
        if (left > 0) { await member.timeout(Math.min(left, MAX_TIMEOUT_MS), 'mute still active').catch(() => null); break; }
    }
}

async function renderInfractionCard(args) {
    return USE_CONTAINERS ? renderInfractionCardContainer(args) : renderInfractionCardEmbed(args);
}

async function renderInfractionCardContainer({ guild, row }) {
    const [target, moderator] = await Promise.all([
        client.users.fetch(row.target_user_id).catch(() => null),
        client.users.fetch(row.moderator_id).catch(() => null)
    ]);
    const labels = Object.fromEntries((await getServerRules(guild.id)).map(r => [r.id, r.label]));
    const custom = !row.rule_id || row.rule_id === 'custom';
    const voided = row.status === 'voided';
    const reasonText = clip(custom ? row.rule_text_snapshot : (row.reason || 'not specified'), 900) || 'not specified';

    const lines = [
        `**ID:** \`#${row.case_number}\``,
        `**Type:** \`${INFRACTION_TYPES[row.action_type] || String(row.action_type || 'manual').toLowerCase()}\``,
        `**User:** ${target ? `${target.username} (<@${target.id}>)` : `<@${row.target_user_id}> (${row.target_user_id})`}`
    ];
    if (!custom) lines.push(`**Rule:** \`${row.rule_id}\`${labels[row.rule_id] ? ` ${stripRulePrefix(labels[row.rule_id])}` : ''}`);
    lines.push(`**Duration:** ${row.duration || 'Permanent'}`);
    lines.push(`**Proof:** ${row.message_content ? clip(row.message_content, 300) : 'No proof provided'}`);
    if (row.evidence_urls?.length) {
        const links = await resolveEvidence(guild, row.evidence_urls);
        lines.push(`**Files:** ${links.slice(0, 5).join(', ')}${links.length > 5 ? ` and ${links.length - 5} more` : ''}`);
    }
    if (voided) lines.push(`**Voided:** by <@${row.voided_by}> <t:${unixTs(row.voided_at)}:R>${row.void_reason ? `: ${clip(row.void_reason, 200)}` : ''}`);

    const container = containerHeader(new ContainerBuilder().setAccentColor(voided ? COLORS.muted : COLORS.danger),
        [`## Infraction #${row.case_number}`, lines.map(l => `> ${l}`).join('\n')].join('\n'), target?.displayAvatarURL?.() || okiteIcon());
    container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`**Reason**\n${codeBlock(reasonText)}`));
    if (!custom && row.rule_text_snapshot) container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`**Rule-text**\n${quotedRuleText(row.rule_text_snapshot, 500)}`));
    container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`-# Created by ${moderator?.username ?? row.moderator_id} / <t:${unixTs(row.created_at)}:f>`));

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`infact:edit:${row.case_number}`).setLabel('Edit reason').setStyle(ButtonStyle.Primary),
        voided
            ? new ButtonBuilder().setCustomId(`infact:restore:${row.case_number}`).setLabel('Restore').setStyle(ButtonStyle.Success)
            : new ButtonBuilder().setCustomId(`infact:void:${row.case_number}`).setLabel('Void').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`infact:history:${row.target_user_id}`).setLabel('User history').setStyle(ButtonStyle.Secondary)
    );
    if (row.message_link) buttons.addComponents(new ButtonBuilder().setLabel('Jump to message').setStyle(ButtonStyle.Link).setURL(String(row.message_link)));
    return { flags: V2_FLAG, components: [container, buttons] };
}

async function renderInfractionCardEmbed({ guild, row }) {
    const [target, moderator] = await Promise.all([
        client.users.fetch(row.target_user_id).catch(() => null),
        client.users.fetch(row.moderator_id).catch(() => null)
    ]);
    const labels = Object.fromEntries((await getServerRules(guild.id)).map(r => [r.id, r.label]));
    const custom = !row.rule_id || row.rule_id === 'custom';
    const voided = row.status === 'voided';

    const lines = [
        `**ID:** \`#${row.case_number}\``,
        `**Type:** \`${INFRACTION_TYPES[row.action_type] || String(row.action_type || 'manual').toLowerCase()}\``,
        `**User:** ${target ? `${target.username} (<@${target.id}>)` : `<@${row.target_user_id}> (${row.target_user_id})`}`
    ];
    if (!custom) lines.push(`**Rule:** \`${row.rule_id}\`${labels[row.rule_id] ? ` ${stripRulePrefix(labels[row.rule_id])}` : ''}`);
    lines.push(`**Reason:** ${clip(custom ? row.rule_text_snapshot : (row.reason || 'not specified'), 300) || 'not specified'}`);
    lines.push(`**Duration:** ${row.duration || 'Permanent'}`);
    lines.push(`**Proof:** ${row.message_content ? clip(row.message_content, 300) : 'No proof provided'}`);
    if (row.evidence_urls?.length) {
        const links = await resolveEvidence(guild, row.evidence_urls);
        lines.push(`**Files:** ${links.slice(0, 5).join(', ')}${links.length > 5 ? ` and ${links.length - 5} more` : ''}`);
    }
    if (voided) lines.push(`**Voided:** by <@${row.voided_by}> <t:${unixTs(row.voided_at)}:R>${row.void_reason ? `: ${clip(row.void_reason, 200)}` : ''}`);

    let description = lines.map(l => `> ${l}`).join('\n');
    if (!custom && row.rule_text_snapshot) description += `\n\n**Rule-text**\n${quotedRuleText(row.rule_text_snapshot, 500)}`;
    if (row.message_link) description += `\n\n**[Jump to message](${row.message_link})**`;

    const embed = new EmbedBuilder()
        .setColor(voided ? COLORS.muted : COLORS.danger)
        .setTitle(`Infraction #${row.case_number}`)
        .setDescription(description)
        .setFooter({ text: `Created by ${moderator?.username ?? row.moderator_id} (${row.moderator_id})`, iconURL: moderator?.displayAvatarURL?.() })
        .setTimestamp(new Date(row.created_at));
    if (target?.displayAvatarURL) embed.setThumbnail(target.displayAvatarURL());

    const components = [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`infact:edit:${row.case_number}`).setLabel('Edit reason').setStyle(ButtonStyle.Primary),
        voided
            ? new ButtonBuilder().setCustomId(`infact:restore:${row.case_number}`).setLabel('Restore').setStyle(ButtonStyle.Success)
            : new ButtonBuilder().setCustomId(`infact:void:${row.case_number}`).setLabel('Void').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`infact:history:${row.target_user_id}`).setLabel('User history').setStyle(ButtonStyle.Secondary)
    )];
    return { content: null, embeds: [embed], components };
}

async function renderInfractionList(args) {
    return renderInfractionListWith(args, USE_CONTAINERS);
}

async function renderInfractionListWith({ guild, sub, target, page = 0 }, asContainer) {
    const column = sub === 'user' ? 'target_user_id' : 'moderator_id';
    const otherColumn = sub === 'user' ? 'moderator_id' : 'target_user_id';
    const [{ data, error }, { count: otherCount }] = await Promise.all([
        supabase.from('infractions').select('*').eq('guild_id', guild.id).eq(column, target.id).order('case_number', { ascending: false }).limit(500),
        supabase.from('infractions').select('id', { count: 'exact', head: true }).eq('guild_id', guild.id).eq(otherColumn, target.id)
    ]);
    if (error) {
        console.error('infraction list error:', error);
        return { content: 'failed to fetch infractions.', embeds: [], components: [] };
    }
    if (!data.length) {
        return { content: sub === 'user' ? `no recorded infractions for **${target.username}**.` : `**${target.username}** hasn't issued any infractions.`, embeds: [], components: [] };
    }

    const labels = Object.fromEntries((await getServerRules(guild.id)).map(r => [r.id, r.label]));
    const names = Object.fromEntries(data.map(r => [r.target_user_id, client.users.cache.get(r.target_user_id)?.username]).filter(([, n]) => n));
    const zone = await getTimezone(guild.id);
    const pageList = asContainer
        ? paginateEntries(data.map(r => infractionEntry(r, labels, { showTarget: sub === 'moderator' })))
        : paginateBlocks(buildInfractionBlocks(data, labels, { showTarget: sub === 'moderator', names, zone }));
    const pages = pageList.length;
    const current = Math.min(Math.max(page, 0), pages - 1);
    const sum = summarise(data);

    const title = `${data.length} infraction(s) found`;
    const stats = asContainer ? infractionSummary(data.length, sum, sub === 'moderator') : infractionStats(data.length, sum, sub === 'moderator');
    const table = asContainer ? '' : renderInfractionBlocks(pageList[current]);
    let embed = null;
    let container = null;
    if (asContainer) {
        container = containerHeader(new ContainerBuilder().setAccentColor(COLORS.muted),
            [`## ${title}`, `**${sub === 'user' ? 'User' : 'Issued by'}:** ${target.username}${target.id ? ` (<@${target.id}>)` : ''}`, stats].join('\n'), target.displayAvatarURL?.() || okiteIcon());
        container.addSeparatorComponents(divider());
        addEntries(container, pageList[current], { buttons: true });
        if (pages > 1) container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`-# page ${current + 1}/${pages}`));
    } else {
        embed = new EmbedBuilder()
            .setColor(COLORS.muted)
            .setAuthor({ name: sub === 'user' ? target.username : `issued by ${target.username}`, iconURL: target.displayAvatarURL?.() })
            .setTitle(title)
            .setDescription([table, stats].join('\n\n'));
        if (pages > 1) embed.setFooter({ text: `page ${current + 1}/${pages}` });
    }

    const components = [];
    if (pages > 1) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`infpage:${sub}:${target.id}:${current - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current === 0),
            new ButtonBuilder().setCustomId(`infpage:${sub}:${target.id}:${current + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current >= pages - 1)
        ));
    }
    if (otherCount > 0) {
        const other = sub === 'user' ? 'moderator' : 'user';
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`infpage:${other}:${target.id}:0`).setLabel(`${other === 'moderator' ? 'Issued' : 'Received'} (${otherCount})`).setStyle(ButtonStyle.Secondary)
        ));
    }
    if (asContainer) return { flags: V2_FLAG, components: [container, ...components], total: data.length };
    return { content: null, embeds: [embed], components, total: data.length };
}
function summarise(rows) {
    const active = rows.filter(r => r.status !== 'voided');
    const byRule = {};
    active.forEach(r => { const k = r.rule_id || 'custom'; byRule[k] = (byRule[k] || 0) + 1; });
    const most = Math.max(0, ...Object.values(byRule));
    const top = Object.entries(byRule).filter(([, n]) => n === most && most > 0).map(([k, n]) => `${k} ×${n}`).join(', ');
    const pool = active.length ? active : rows;
    const latest = pool.reduce((best, r) => (!best || Date.parse(r.created_at) > Date.parse(best.created_at) ? r : best), null);
    return { active: active.length, voided: rows.length - active.length, top, last: latest ? { number: latest.case_number, at: latest.created_at } : null };
}

const BAN_PROMPT_HOURS = Number(process.env.BAN_PROMPT_HOURS) || 24;
const INDEX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const botBans = new Set();
const indexBuffer = [];
let indexFlushing = false;

const formatSize = (bytes) => {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
    return `${(n / 1073741824).toFixed(1)} GB`;
};
const describeFile = (name, type, size) => {
    const major = String(type || '').split('/')[0];
    const category = ['image', 'video', 'audio', 'text'].includes(major) ? major : 'file';
    const ext = String(name || '').match(/\.([A-Za-z0-9]{1,6})$/)?.[1];
    const subtype = String(type || '').split('/')[1]?.split(/[;+]/)[0];
    return `${name} / ${category} / ${(ext || subtype || 'unknown').toUpperCase()} (${formatSize(size)})`;
};
function trimLink(url) {
    let u = url;
    for (;;) {
        const before = u;
        u = u.replace(/[.,!?;:*_~`]+$/, '');
        if (u.endsWith(')') && (u.match(/\)/g) || []).length > (u.match(/\(/g) || []).length) u = u.slice(0, -1);
        if (u === before) return u;
    }
}

function linksField(text, max = 10) {
    const found = [...new Set((String(text || '').match(/https?:\/\/[^\s<>"'\]\[]+/gi) || []).map(trimLink))].filter(u => u.length > 8);
    if (!found.length) return null;
    const line = (url) => {
        const label = url.replace(/^https?:\/\//i, '');
        return `\\- [${cut(label, 70)}](${url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
    };
    const shown = found.slice(0, max).map(line);
    if (found.length > max) shown.push(`+${found.length - max} more`);
    return { name: 'links', value: shown.join('\n'), section: true };
}
const describeAttachment = (a) => describeFile(a.name, a.contentType, a.size);
const altText = (a) => String(a.description || describeAttachment(a)).slice(0, 1000);
const describeAttachmentLink = (a) => {
    const line = describeAttachment(a);
    const label = String(a.name).replace(/[\[\]]/g, '\\$&');
    return a.url && line.startsWith(a.name) ? `[${label}](${a.url})${line.slice(a.name.length)}` : line;
};

// delete-time download; bytes freed after send
async function downloadAttachments(attachments, budget = MAX_UPLOAD_BYTES) {
    const all = Array.from(attachments?.values?.() ?? []).slice(0, 10);
    const uploads = [];
    const remote = [];
    let planned = 0;
    const wanted = [];
    for (const a of all) {
        if (planned + (a.size || 0) > budget) remote.push({ url: a.url, image: !!a.contentType?.startsWith('image/'), alt: altText(a) });
        else { planned += a.size || 0; wanted.push(a); }
    }
    const results = await Promise.all(wanted.map(async (a, i) => {
        try {
            const res = await fetch(a.url, { signal: AbortSignal.timeout(15000) });
            if (!res.ok) throw new Error(`status ${res.status}`);
            return { name: `${i + 1}-${safeName(a.name)}`, buffer: Buffer.from(await res.arrayBuffer()), image: !!a.contentType?.startsWith('image/'), alt: altText(a) };
        } catch (err) {
            console.error('file download error:', err.message);
            return null;
        }
    }));
    results.forEach((r, i) => { if (r) uploads.push(r); else remote.push({ url: wanted[i].url, image: !!wanted[i].contentType?.startsWith('image/'), alt: altText(wanted[i]) }); });
    return { uploads, remote };
}
const safeName = (name) => String(name || 'file').replace(/[^\w.-]/g, '_').slice(-80);

function indexMessage(message) {
    if (!supabase) return;
    indexBuffer.push({
        guild_id: message.guildId,
        message_id: message.id,
        channel_id: message.channelId,
        user_id: message.author.id,
        has_attachments: message.attachments.size > 0,
        created_at: message.createdAt.toISOString()
    });
}

async function flushIndex() {
    if (!supabase || indexFlushing || indexBuffer.length === 0) return;
    indexFlushing = true;
    const batch = indexBuffer.splice(0, 500);
    try {
        const { error } = await supabase.from('message_index').upsert(batch, { onConflict: 'guild_id,message_id', ignoreDuplicates: true });
        if (error) throw error;
    } catch (err) {
        console.error('message index flush error:', err.message || err);
        if (indexBuffer.length < 5000) indexBuffer.unshift(...batch);
    } finally {
        indexFlushing = false;
    }
}

const CACHE_TTL_MS = 72 * 3600e3;
const cacheBuffer = [];
let cacheFlushing = false;

function cacheRow(m) {
    return {
        guild_id: m.guildId,
        message_id: m.id,
        channel_id: m.channelId,
        author_id: m.author.id,
        author_name: m.author.username,
        content: (m.content || '').slice(0, 4000),
        attachments: Array.from(m.attachments?.values?.() ?? []).map(a => ({ name: a.name, size: a.size, type: a.contentType })),
        embeds: m.embeds?.length ?? 0,
        stickers: Array.from(m.stickers?.values?.() ?? []).map(st => st.name),
        reply_to: m.reference?.messageId ?? null,
        created_at: m.createdAt.toISOString()
    };
}

function cacheMessage(message) {
    if (!supabase || !message.guild || message.partial || !message.author || message.author.bot) return;
    cacheBuffer.push(cacheRow(message));
}

async function flushCache() {
    if (!supabase || cacheFlushing || cacheBuffer.length === 0) return;
    cacheFlushing = true;
    const batch = cacheBuffer.splice(0, 500);
    try {
        const unique = [...new Map(batch.map(r => [`${r.guild_id}:${r.message_id}`, r])).values()];
        const { error } = await supabase.from('message_cache').upsert(unique, { onConflict: 'guild_id,message_id' });
        if (error) throw error;
    } catch (err) {
        console.error('message cache flush error:', err.message || err);
        if (cacheBuffer.length < 5000) cacheBuffer.unshift(...batch);
    } finally {
        cacheFlushing = false;
    }
}

async function lookupCachedMessage(guildId, messageId) {
    const buffered = [...cacheBuffer].reverse().find(r => r.guild_id === guildId && r.message_id === messageId);
    if (buffered) return buffered;
    if (!supabase) return null;
    const { data, error } = await supabase.from('message_cache').select('*').eq('guild_id', guildId).eq('message_id', messageId).maybeSingle();
    if (error) { console.error('message cache lookup error:', error.message); return null; }
    return data;
}

async function lookupCachedMessages(guildId, ids) {
    const found = new Map(cacheBuffer.filter(r => r.guild_id === guildId && ids.includes(r.message_id)).map(r => [r.message_id, r]));
    const missing = ids.filter(id => !found.has(id));
    if (supabase && missing.length) {
        for (let i = 0; i < missing.length; i += 100) {
            const { data } = await supabase.from('message_cache').select('*').eq('guild_id', guildId).in('message_id', missing.slice(i, i + 100));
            (data || []).forEach(r => found.set(r.message_id, r));
        }
    }
    return found;
}

function forgetCachedMessages(guildId, ids) {
    if (!ids.length) return;
    const set = new Set(ids);
    for (let i = cacheBuffer.length - 1; i >= 0; i--) {
        if (cacheBuffer[i].guild_id === guildId && set.has(cacheBuffer[i].message_id)) cacheBuffer.splice(i, 1);
    }
    if (supabase) {
        supabase.from('message_cache').delete().eq('guild_id', guildId).in('message_id', ids).then(({ error }) => { if (error) console.error('message cache forget error:', error.message); }, () => null);
    }
}

function forgetCachedMessagesBy(guildId, authorId) {
    for (let i = cacheBuffer.length - 1; i >= 0; i--) {
        if (cacheBuffer[i].guild_id === guildId && cacheBuffer[i].author_id === authorId) cacheBuffer.splice(i, 1);
    }
    if (supabase) {
        supabase.from('message_cache').delete().eq('guild_id', guildId).eq('author_id', authorId).then(({ error }) => { if (error) console.error('message cache forget error:', error.message); }, () => null);
    }
}

let heartbeatEnabled = false;

async function loadLastSeen() {
    if (supabase) {
        const { data } = await supabase.from('bot_state').select('value').eq('key', 'last_seen').maybeSingle();
        if (data?.value?.at) return Math.max(Number(data.value.at), lastSeenLocal ?? 0);
    }
    return lastSeenLocal;
}

async function saveLastSeen(at = Date.now()) {
    lastSeenLocal = at;
    saveStateNow();
    if (supabase) await supabase.from('bot_state').upsert({ key: 'last_seen', value: { at }, updated_at: new Date(at).toISOString() }, { onConflict: 'key' });
}

const SNAPSHOT_FILE = nodePath.join(DATA_DIR, 'snapshots.json');

function takeSnapshot(guild) {
    return {
        at: Date.now(),
        memberCount: guild.memberCount ?? null,
        channels: [...guild.channels.cache.values()].filter(c => !c.isThread?.()).map(c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId ?? null })),
        roles: [...guild.roles.cache.values()].map(r => ({ id: r.id, name: r.name }))
    };
}

async function saveSnapshots() {
    const all = {};
    for (const guild of client.guilds.cache.values()) all[guild.id] = takeSnapshot(guild);
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(all));
    } catch (err) {
        console.error('could not write snapshots:', err.message);
    }
    if (supabase && Object.keys(all).length) {
        const { error } = await supabase.from('guild_snapshots').upsert(Object.entries(all).map(([guild_id, data]) => ({ guild_id, data, updated_at: new Date().toISOString() })), { onConflict: 'guild_id' });
        if (error) console.error('snapshot save error:', error.message);
    }
}

async function loadSnapshot(guildId) {
    if (supabase) {
        const { data } = await supabase.from('guild_snapshots').select('data').eq('guild_id', guildId).maybeSingle();
        if (data?.data) return data.data;
    }
    try { return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'))[guildId] ?? null; } catch { return null; }
}

function heartbeat() {
    if (!heartbeatEnabled) return;
    saveLastSeen().catch(err => console.error('heartbeat error:', err.message));
}
setInterval(heartbeat, 15 * 1000).unref();
setInterval(() => { if (heartbeatEnabled) saveSnapshots().catch(err => console.error('snapshot error:', err.message)); }, 5 * 60 * 1000).unref();

function spoolSync() {
    if (!indexBuffer.length && !cacheBuffer.length) return;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(SPOOL_FILE, JSON.stringify({ index: indexBuffer, cache: cacheBuffer }));
    } catch (err) {
        console.error('could not write the spool:', err.message);
    }
}

function restoreSpool() {
    try {
        const saved = JSON.parse(fs.readFileSync(SPOOL_FILE, 'utf8'));
        indexBuffer.unshift(...(saved.index || []));
        cacheBuffer.unshift(...(saved.cache || []));
        fs.unlinkSync(SPOOL_FILE);
        console.log(`restored ${(saved.index || []).length + (saved.cache || []).length} buffered rows from the last run`);
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('could not restore the spool:', err.message);
    }
}

async function flushAll() {
    await Promise.all([flushIndex(), flushCache()]);
}

async function pruneIndex() {
    if (!supabase) return;
    const { error } = await supabase.from('message_index').delete().lt('created_at', new Date(Date.now() - INDEX_WINDOW_MS).toISOString());
    if (error) console.error('message index prune error:', error.message);
    const { error: cacheError } = await supabase.from('message_cache').delete().lt('created_at', new Date(Date.now() - CACHE_TTL_MS).toISOString());
    if (cacheError) console.error('message cache prune error:', cacheError.message);
}

async function getIndexedRefs(guildId, userId) {
    await flushIndex();
    const { data, error } = await supabase
        .from('message_index')
        .select('channel_id, message_id')
        .eq('guild_id', guildId)
        .eq('user_id', userId)
        .gt('created_at', new Date(Date.now() - INDEX_WINDOW_MS).toISOString())
        .order('created_at', { ascending: true })
        .limit(1000);
    if (error) {
        console.error('message index lookup error:', error);
        return [];
    }
    return data.map(r => ({ c: r.channel_id, m: r.message_id }));
}

async function fetchSnapshot(guild, refs) {
    const found = [];
    let missing = 0;
    let next = 0;
    const worker = async () => {
        while (next < refs.length) {
            const ref = refs[next++];
            const channel = guild.channels.cache.get(ref.c) ?? await guild.channels.fetch(ref.c).catch(() => null);
            const message = channel?.isTextBased() ? await channel.messages.fetch(ref.m).catch(() => null) : null;
            if (message) found.push(message); else missing++;
        }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    found.sort((x, y) => x.createdTimestamp - y.createdTimestamp);
    return { messages: found, missing };
}

function buildBanTranscript(target, infraction, messages, missing) {
    const header = `ban snapshot for ${target.username} (${target.id}) // infraction #${infraction.case_number} // ${messages.length} message(s) recovered, ${missing} unavailable\n---`;
    const lines = messages.map(m => {
        let extras = '';
        if (m.attachments.size > 0) extras += ` [files: ${Array.from(m.attachments.values()).map(describeAttachment).join(', ')}]`;
        if (m.embeds.length > 0) extras += ` [${m.embeds.length} embed(s)]`;
        if (m.stickers.size > 0) extras += ` [stickers: ${m.stickers.map(st => st.name).join(', ')}]`;
        if (m.reference?.messageId) extras += ` [reply to ${m.reference.messageId}]`;
        return `[${m.createdAt.toISOString()}] #${m.channel?.name ?? m.channelId} <${m.id}>: ${m.content}${extras}`;
    });
    return `${header}\n${lines.join('\n')}`;
}

async function deleteSnapshotMessages(guild, messages) {
    const byChannel = new Map();
    for (const m of messages) {
        if (!byChannel.has(m.channelId)) byChannel.set(m.channelId, []);
        byChannel.get(m.channelId).push(m.id);
        suppressedDeletes.add(m.id);
    }
    for (const [channelId, ids] of byChannel) {
        const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;
        for (let i = 0; i < ids.length; i += 100) {
            const chunk = ids.slice(i, i + 100);
            if (chunk.length === 1) await channel.messages.delete(chunk[0]).catch(() => null);
            else await channel.bulkDelete(chunk, true).catch(err => console.error('ban cleanup delete error:', err.message));
        }
    }
    if (supabase) {
        await supabase.from('message_index').delete().eq('guild_id', guild.id).in('message_id', messages.map(m => m.id));
    }
}

async function archiveAttachments(guild, messages, pending, target) {
    const logChannel = await getLogChannel(guild, 'citation');
    if (!logChannel) return { archived: 0, failed: 0, skipped: [], refs: [], error: 'no log channel' };

    const items = messages.flatMap(m => Array.from(m.attachments.values()).map(a => ({ a, m })));
    const skipped = [];
    const batches = [];
    let current = { items: [], bytes: 0 };
    for (const item of items) {
        if (item.a.size > MAX_UPLOAD_BYTES) { skipped.push(describeAttachment(item.a)); continue; }
        if (current.items.length >= 10 || current.bytes + item.a.size > MAX_UPLOAD_BYTES) {
            batches.push(current);
            current = { items: [], bytes: 0 };
        }
        current.items.push(item);
        current.bytes += item.a.size;
    }
    if (current.items.length) batches.push(current);

    let archived = 0, failed = 0;
    const refs = [];
    for (const [i, batch] of batches.entries()) {
        const files = [];
        const lines = [];
        await Promise.all(batch.items.map(async ({ a, m }, idx) => {
            try {
                const res = await fetch(a.url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const spoiler = /^(image|video)\//.test(a.contentType || '') ? 'SPOILER_' : '';
                files[idx] = new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name: `${spoiler}${m.id}-${safeName(a.name)}` });
                lines[idx] = `${a.name}: ${m.url}`;
            } catch (err) {
                console.error('archive download error:', err.message);
                failed++;
            }
        }));
        const ready = files.filter(Boolean);
        if (!ready.length) continue;
        const sent = await logChannel.send({
            content: clip(`infraction #${pending.case_number} archive for ${target.username} (batch ${i + 1}/${batches.length})\n${lines.filter(Boolean).join('\n')}`, 1900),
            files: ready,
            allowedMentions: { parse: [] }
        }).catch(err => { console.error('archive post error:', err.message); return null; });
        if (sent) { archived += ready.length; refs.push(`msg:${sent.channelId}:${sent.id}`); }
        else failed += ready.length;
    }
    return { archived, failed, skipped, refs };
}

async function editBanPrompt(guild, pending, content) {
    if (!pending.prompt_channel_id || !pending.prompt_message_id) return;
    const channel = guild.channels.cache.get(pending.prompt_channel_id);
    const message = await channel?.messages.fetch(pending.prompt_message_id).catch(() => null);
    if (!message) return;
    const first = message.components?.[0];
    if (first?.type === ComponentType.Container) {
        const container = new ContainerBuilder(first.toJSON());
        container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(content));
        await message.edit({ components: [container], allowedMentions: { parse: [] } }).catch(err => console.error('ban prompt edit error:', err.message));
        return;
    }
    await message.edit({ content, components: [], allowedMentions: { parse: [] } }).catch(() => null);
}

async function finalizeBan(guild, pending, { save, by }) {
    const target = await client.users.fetch(pending.target_user_id).catch(() => ({ id: pending.target_user_id, username: pending.target_user_id }));
    const { messages } = await fetchSnapshot(guild, pending.refs);

    let summary = save ? '' : (by ? 'evidence not saved.' : `no answer within ${BAN_PROMPT_HOURS}h, evidence not saved.`);
    const fields = [
        { name: by ? 'moderator' : 'decided', value: by ? who(by) : 'timed out', inline: true },
        { name: 'user', value: who(target), inline: true }
    ];

    if (save) {
        const result = await archiveAttachments(guild, messages, pending, target);
        if (result.refs.length) {
            const { data: row } = await supabase.from('infractions').select('evidence_urls').eq('guild_id', pending.guild_id).eq('case_number', pending.case_number).maybeSingle();
            await supabase.from('infractions').update({ evidence_urls: [...(row?.evidence_urls || []), ...result.refs] }).eq('guild_id', pending.guild_id).eq('case_number', pending.case_number);
        }
        summary = `archived ${result.archived} file(s) in the log channel${result.failed ? `, ${result.failed} failed` : ''}${result.skipped.length ? `, ${result.skipped.length} too large to re-upload` : ''}.`;
        fields.push({ name: 'archived / failed', value: `${result.archived} / ${result.failed}`, inline: true });
        if (result.skipped.length) fields.push({ name: 'too large (not archived)', value: clip(result.skipped.join('\n')) });
    }

    if (pending.delete_after) {
        await deleteSnapshotMessages(guild, messages);
        summary += ` ${messages.length} message(s) deleted.`;
    }

    await supabase.from('pending_bans').update({ status: 'done' }).eq('id', pending.id);
    await editBanPrompt(guild, pending, `${summary} (infraction #${pending.case_number})${by ? `, decided by <@${by.id}>` : ''}`);
    await sendLog(guild, {
        title: `infraction #${pending.case_number}: ${save ? 'attachments archived' : 'attachments not saved'}`,
        kind: 'citation',
        color: save ? COLORS.good : COLORS.muted,
        description: summary,
        fields
    });
    return summary;
}

async function claimPendingBan(id) {
    const { data } = await supabase.from('pending_bans').update({ status: 'processing' }).eq('id', id).eq('status', 'awaiting').select().maybeSingle();
    return data || null;
}

async function sweepPendingBans() {
    if (!supabase) return;
    const { data, error } = await supabase.from('pending_bans').select('id').eq('status', 'awaiting').lt('deadline', new Date().toISOString());
    if (error) return console.error('pending ban sweep error:', error.message);
    for (const { id } of data) {
        const pending = await claimPendingBan(id);
        const guild = pending && client.guilds.cache.get(pending.guild_id);
        if (!guild) continue;
        await finalizeBan(guild, pending, { save: false, by: null }).catch(err => console.error('pending ban timeout error:', err));
    }
}

const NO_LOG_NOTE = 'no log channel is set, so no transcript or save prompt was made and their messages stay up. set one with /setlog.';
const NO_LOGS_NOTE = 'message logs are off for this server, so no transcript was made and their messages stay up. turn them on with /messagelogs.';
const NO_LOG_CHOICE = 'no log channel set - transcription not feasible; leave messages or purge?';

const noLogButtons = (userId, caseNumber) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nolog_keep:${userId}:${caseNumber}`).setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`nolog_delete:${userId}:${caseNumber}`).setLabel('Purge').setStyle(ButtonStyle.Danger)
);

// after ban; transcript, attachments prompt
async function runBanSnapshot({ guild, target, infraction, moderatorId, deleteAfter, notify }) {
    if (!(await messageLogsOn(guild.id))) {
        notify?.(NO_LOGS_NOTE);
        return;
    }
    const logChannel = await getLogChannel(guild, 'citation');
    if (!logChannel) {
        console.warn(`ban snapshot skipped for infraction #${infraction.case_number}: no log channel in ${guild.id}`);
        notify?.(NO_LOG_NOTE);
        return;
    }
    const refs = await getIndexedRefs(guild.id, target.id);
    if (!refs.length) {
        await sendLog(guild, { title: `ban snapshot: infraction #${infraction.case_number}`, kind: 'citation', color: COLORS.muted, description: `no indexed messages for ${target.username} in the last 7 days.` });
        return;
    }

    const { messages, missing } = await fetchSnapshot(guild, refs);
    const attachments = messages.flatMap(m => Array.from(m.attachments.values()));
    const totalBytes = attachments.reduce((n, a) => n + a.size, 0);

    const logged = await sendLog(guild, {
        title: `ban transcript: infraction #${infraction.case_number}`,
        kind: 'citation',
        color: COLORS.danger,
        fields: [
            { name: 'user', value: who(target), inline: true },
            { name: 'messages recovered', value: String(messages.length), inline: true },
            { name: 'unavailable', value: String(missing), inline: true },
            { name: 'attachments', value: attachments.length ? `${attachments.length} (${formatSize(totalBytes)})` : 'none', inline: true }
        ],
        file: { name: `ban-${infraction.case_number}-${target.id}.txt`, content: buildBanTranscript(target, infraction, messages, missing) }
    });
    if (!logged) {
        notify?.('could not write the ban transcript to the log channel, so their messages were left in place.');
        return;
    }
    if (messages.length === 0) return;

    if (attachments.length === 0) {
        if (deleteAfter) await deleteSnapshotMessages(guild, messages);
        return;
    }

    const promptFacts = [`> **Infraction:** \`#${infraction.case_number}\``, `> **User:** ${target.username} (<@${target.id}>)`, `> **Attachments:** ${attachments.length} (${formatSize(totalBytes)})`, `> **Transcript:** already logged`, `> **Copied so far:** nothing`, `> **Validity:** ${BAN_PROMPT_HOURS}h`].join('\n');
    const promptFiles = clip(attachments.map(describeAttachment).join('\n'), 1200);
    const promptNotice = deleteAfter
        ? `Their messages stay up until you answer, then okite deletes them. If nobody answers they are deleted after ${BAN_PROMPT_HOURS} hours and nothing is saved.`
        : 'Their messages were not deleted by this ban.';
    const promptWarning = '**Do not save anything that may be illegal (such as CSAM).** Choose "don\'t save", then report it with Discord\'s Report Message and to your national hotline.';
    const avatar = target.displayAvatarURL?.();
    const promptEmbed = () => {
        const embed = new EmbedBuilder()
            .setColor(COLORS.danger)
            .setTitle(`Save attachments from ${target.username}?`)
            .setDescription([promptFacts, `**Files**\n${promptFiles}`, promptNotice, promptWarning].join('\n\n'))
            .setTimestamp();
        if (avatar) embed.setThumbnail(avatar);
        return embed;
    };
    const promptContainer = () => {
        const container = containerHeader(new ContainerBuilder().setAccentColor(COLORS.danger), `## Save attachments from ${target.username}?\n${promptFacts}`, avatar || okiteIcon());
        container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`**Files**\n${codeBlock(promptFiles)}`));
        container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`${promptNotice}\n\n${promptWarning}`));
        container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`-# <t:${Math.floor(Date.now() / 1000)}:f>`));
        return container;
    };

    const { data: pending, error } = await supabase.from('pending_bans').insert({
        guild_id: guild.id,
        case_number: infraction.case_number,
        target_user_id: target.id,
        moderator_id: moderatorId || null,
        refs: messages.map(m => ({ c: m.channelId, m: m.id })),
        delete_after: deleteAfter,
        deadline: new Date(Date.now() + BAN_PROMPT_HOURS * 3600 * 1000).toISOString()
    }).select().single();
    if (error) {
        console.error('pending ban insert error:', error);
        notify?.('could not record the pending ban, so their messages were left in place.');
        return;
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ban_save:${pending.id}`).setLabel('save attachments').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ban_skip:${pending.id}`).setLabel('don\'t save').setStyle(ButtonStyle.Secondary)
    );
    let sent = USE_CONTAINERS
        ? await logChannel.send({ flags: V2_FLAG, components: [promptContainer(), row], allowedMentions: { parse: [] } }).catch(err => { console.error('ban prompt container error:', err.message); return null; })
        : null;
    if (!sent) sent = await logChannel.send({ embeds: [promptEmbed()], components: [row], allowedMentions: { parse: [] } });
    await supabase.from('pending_bans').update({ prompt_channel_id: sent.channelId, prompt_message_id: sent.id }).eq('id', pending.id);
}

restoreSpool();
setInterval(flushAll, 3000).unref();

process.on('exit', () => { if (heartbeatEnabled) { lastSeenLocal = Date.now(); saveStateNow(); } spoolSync(); });
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        await Promise.race([Promise.all([flushAll(), heartbeatEnabled ? saveSnapshots() : null, heartbeatEnabled ? saveLastSeen() : null]).catch(() => null), new Promise(r => setTimeout(r, 3000))]);
        saveStateNow();
        process.exit(0);
    });
}
setInterval(pruneIndex, 60 * 60 * 1000).unref();
setInterval(() => sweepPendingBans().catch(err => console.error(err)), 60 * 1000).unref();
setInterval(() => sweepRemovedGuilds().catch(err => console.error('removed guild sweep error:', err.message)), 60 * 60 * 1000).unref();
setInterval(() => sweepTimedPunishments().catch(err => console.error('timed punishment sweep error:', err)), 60 * 1000).unref();

async function resolveEvidence(guild, entries) {
    const links = [];
    for (const entry of entries || []) {
        if (entry.startsWith('msg:')) {
            const [, channelId, messageId] = entry.split(':');
            const channel = guild.channels.cache.get(channelId);
            const message = await channel?.messages.fetch(messageId).catch(() => null);
            if (!message) { links.push(`${entry} (archive message deleted)`); continue; }
            message.attachments.forEach(a => links.push(`[${a.name}](${a.url})`));
        } else {
            links.push(entry);
        }
    }
    return links;
}

async function findMessageDeleter(guild, authorId, channelId) {
    await new Promise(r => setTimeout(r, 1200));
    try {
        const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 10 });
        const entry = logs.entries.find(e => e.target?.id === authorId
            && (!e.extra?.channel || e.extra.channel.id === channelId)
            && Date.now() - e.createdTimestamp < 15000);
        return entry ? { kind: 'mod', executor: entry.executor } : { kind: 'self' };
    } catch {
        return { kind: 'unknown' };
    }
}

// executor; auditlog
async function findExecutor(guild, type, targetId) {
    try {
        const logs = await guild.fetchAuditLogs({ type, limit: 5 });
        const entry = logs.entries.find(e => e.target?.id === targetId && Date.now() - e.createdTimestamp < 10000);
        return entry ? { executor: entry.executor, reason: entry.reason, changes: entry.changes } : null;
    } catch {
        return null;
    }
}

// escape markdown; mentions pass
function plainText(text) {
    const keep = /<(?:@[!&]?\d+|#\d+|t:\d+(?::[tTdDfFR])?|a?:\w+:\d+)>/g;
    const escape = (part) => part
        .replace(/[\\*_~|`>#\[\]()]/g, '\\$&')
        .replace(/^(\s*)([-+])(\s)/gm, '$1\\$2$3')
        .replace(/^(\s*)(\d+)\.(\s)/gm, '$1$2\\.$3')
        .replace(/(https?):\/\//gi, '$1:\u200b//');
    const input = String(text);
    let out = '';
    let last = 0;
    for (const m of input.matchAll(keep)) {
        out += escape(input.slice(last, m.index)) + m[0];
        last = m.index + m[0].length;
    }
    return out + escape(input.slice(last));
}

const PURGE_PREVIEW_CHARS = Math.min(Number(process.env.PURGE_PREVIEW_CHARS) || 2600, 3000);
function purgePreview(messages, limit = PURGE_PREVIEW_CHARS, zone) {
    const blocks = [];
    let used = 0;
    for (const m of messages) {
        const files = m.attachments?.size ? ` \\[+${m.attachments.size} file${m.attachments.size > 1 ? 's' : ''}\\]` : '';
        const [first, ...more] = String(m.content || '').replace(/\s+$/, '').split('\n');
        let block = `[\`${clockText(m.createdAt, zone)}\`] **${plainText(m.author.username)}**: ${plainText(first) || (more.length ? '' : '*(no text)*')}${more.map(l => `\n\u00A0\u00A0\u00A0\u00A0${plainText(l)}`).join('')}${files}`;
        if (used + block.length + 1 > limit - 40 && blocks.length) break;
        if (!blocks.length) block = cut(block, limit - 40);
        blocks.push(block);
        used += block.length + 1;
    }
    if (blocks.length < messages.length) blocks.push(`… and ${messages.length - blocks.length} more in the transcript`);
    return blocks.join('\n');
}

function mentionList(ids, max = 25) {
    const lines = ids.slice(0, max).map(id => `\\- <@${id}>`);
    if (ids.length > max) lines.push(`+${ids.length - max} more`);
    return lines.join('\n');
}

// log-before-delete; no log = no delete
async function executePurge(interaction, toDelete, { label, detailFields = [] }) {
    const user = interaction.user;
    const toDeleteIds = toDelete.map(m => m.id);

    if (toDelete.length > 200) {
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('purge_confirm').setLabel(`confirm delete of ${toDelete.length} messages`).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('purge_cancel').setLabel('cancel').setStyle(ButtonStyle.Secondary)
        );

        const confirmReply = await interaction.editReply({
            content: `this range covers **${toDelete.length}** messages, over the 200 auto-confirm threshold. proceed?`,
            components: [confirmRow]
        });

        const confirmation = await confirmReply.awaitMessageComponent({
            filter: i => i.user.id === user.id,
            time: 30000
        }).catch(() => null);

        if (!confirmation || confirmation.customId === 'purge_cancel') {
            markedpurgestarts.delete(user.id);
            return interaction.editReply({
                content: confirmation ? 'purge cancelled.' : 'confirmation timed out, purge cancelled.',
                components: []
            });
        }

        await confirmation.update({ content: `purging ${toDelete.length} messages...`, components: [] });
    }

    const header = `${label} executed by: ${user.username} (${user.id}) // channel: #${interaction.channel.name} (${interaction.channelId}) // count: ${toDelete.length}\n---`;
    const logsLines = [];
    for (const m of toDelete) {
        const time = m.createdAt.toISOString();
        let extras = '';
        if (m.attachments.size > 0) {
            extras += ` [files: ${Array.from(m.attachments.values()).map(describeAttachment).join(', ')}]`;
        }
        if (m.embeds.length > 0) extras += ` [${m.embeds.length} embed(s)]`;
        if (m.stickers.size > 0) extras += ` [stickers: ${m.stickers.map(s => s.name).join(', ')}]`;
        if (m.reference?.messageId) extras += ` [reply to ${m.reference.messageId}]`;
        logsLines.push(`[${time}] ${m.author.username} (${m.author.id}) <${m.id}>: ${m.content}${extras}`);
    }
    const transcript = `${header}\n${logsLines.join('\n')}`;

    const authors = [...new Set(toDelete.map(m => m.author.id))];
    const logged = await sendLog(interaction.guild, {
        title: label,
        kind: 'purge',
        color: COLORS.danger,
        fields: [
            { name: 'moderator', value: who(user), inline: true },
            { name: 'channel', value: `<#${interaction.channelId}>`, inline: true },
            { name: 'messages', value: String(toDelete.length), inline: true },
            { name: 'unique authors', value: String(authors.length), detail: mentionList(authors), inline: true },
            ...detailFields,
            { name: 'time-span', value: `${toDelete[0].createdAt.toISOString()} → ${toDelete[toDelete.length - 1].createdAt.toISOString()}` },
            { name: 'preview', value: purgePreview(toDelete, undefined, await getTimezone(interaction.guildId)), section: true, quote: true }
        ],
        file: { name: `purge-${interaction.channelId}-${Date.now()}.txt`, content: transcript }
    });
    if (!logged) {
        return interaction.editReply('could not write to the log channel, purge aborted so nothing gets deleted without a paper trail.');
    }

    toDelete.forEach(m => suppressedDeletes.add(m.id));

    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const recent = toDelete.filter(m => m.createdTimestamp > fourteenDaysAgo);
    const old = toDelete.filter(m => m.createdTimestamp <= fourteenDaysAgo);

    for (let i = 0; i < recent.length; i += 100) {
        await interaction.channel.bulkDelete(recent.slice(i, i + 100).map(m => m.id));
    }

    for (const m of old) {
        await m.delete().catch(() => null);
        await new Promise(r => setTimeout(r, 1000));
    }

    markedpurgestarts.delete(user.id);

    let result = `purged ${toDeleteIds.length} messages.`;
    if (old.length > 0) result += ` (${old.length} were over 14 days old and deleted individually, slower)`;
    return interaction.editReply(result);
}

async function fetchRangeMessages(channel, startId, endId) {
    const collected = [];
    let before = undefined;
    let startFound = false, endFound = false;
    const maxPages = 10;

    for (let page = 0; page < maxPages; page++) {
        const batch = await channel.messages.fetch({ limit: 100, before });
        if (batch.size === 0) break;
        collected.push(...batch.values());
        startFound = collected.some(m => m.id === startId);
        endFound = collected.some(m => m.id === endId);
        if (startFound && endFound) break;
        before = batch.last().id;
    }

    return { messages: collected, startFound, endFound };
}

client.once(Events.ClientReady, (readyClient) => {
    console.log(`ready - logged in as ${readyClient.user.tag}`);
    sweepPendingBans().catch(err => console.error(err));
    sweepTimedPunishments().catch(err => console.error('timed punishment sweep error:', err));
    runCatchUp().catch(err => console.error('catch-up error:', err));
    sweepRemovedGuilds().catch(err => console.error('removed guild sweep error:', err.message));
});

async function handleAutocomplete(interaction) {
    if (!interaction.guild) return interaction.respond([]);
    const focused = interaction.options.getFocused(true);
    const typed = String(focused.value || '').toLowerCase();
    const { commandName, guildId } = interaction;
    let choices = [];

    const ruleCommands = ['infraction', 'ban', 'kick', 'softban', 'mute'];
    if (commandName === 'alias' && focused.name === 'name') {
        choices = [...(await getAliases(guildId)).keys()].filter(n => !typed || n.includes(typed)).map(n => ({ name: n, value: n }));
    } else if (focused.name === 'duration') {
        const presets = ['10m', '1h', '12h', '1d', '3d', '7d', '28d', 'permanent'];
        choices = presets.filter(p => !typed || p.startsWith(typed)).map(p => ({ name: parseDuration(p)?.label ?? p, value: p }));
        const custom = parseDuration(typed);
        if (custom && !presets.includes(typed)) choices.unshift({ name: custom.label, value: typed });
    } else if ((ruleCommands.includes(commandName) && focused.name === 'rule') || (commandName === 'rule' && focused.name === 'id')) {
        const serverRules = await getServerRules(guildId);
        choices = serverRules
            .filter(r => !typed || r.id.toLowerCase().includes(typed) || (r.label || '').toLowerCase().includes(typed))
            .map(r => ({ name: `${r.id}: ${r.label}`.slice(0, 100), value: r.id }));
        if ((commandName === 'infraction' || ruleCommands.includes(commandName)) && (!typed || 'custom'.includes(typed))) {
            choices.unshift({ name: 'custom: no rule, just a reason', value: 'custom' });
        }
    } else if (commandName === 'infraction' && focused.name === 'id' && supabase) {
        const perms = interaction.memberPermissions;
        const isMod = perms && (perms.has(PermissionFlagsBits.ManageMessages) || perms.has(PermissionFlagsBits.Administrator));
        if (!isMod) return interaction.respond([]);
        const { data } = await supabase
            .from('infractions')
            .select('case_number, target_user_id, rule_id, status')
            .eq('guild_id', guildId)
            .order('case_number', { ascending: false })
            .limit(200);
        choices = (data || [])
            .filter(r => !typed || String(r.case_number).startsWith(typed.replace('#', '')))
            .map(r => {
                const who = client.users.cache.get(r.target_user_id)?.username || r.target_user_id;
                return { name: `#${r.case_number} / ${who} / ${r.rule_id || 'custom'}${r.status === 'voided' ? ' (voided)' : ''}`.slice(0, 100), value: r.case_number };
            });
    }
    return interaction.respond(choices.slice(0, 25));
}

async function handleInteraction(interaction) {
    if (interaction.isAutocomplete?.()) return handleAutocomplete(interaction).catch(() => interaction.respond([]).catch(() => null));

    if (!interaction.guild) {
        return interaction.reply({ content: 'okite is a server-only utility.', ephemeral: true });
    }

    const perms = interaction.memberPermissions;
    const isMod = perms && (perms.has(PermissionFlagsBits.ManageMessages) || perms.has(PermissionFlagsBits.Administrator));
    const isManager = perms && (perms.has(PermissionFlagsBits.ManageChannels) || perms.has(PermissionFlagsBits.Administrator));

    if (interaction.isChatInputCommand()) {
        const { commandName, options, guildId } = interaction;

        if (['setlog', 'logchannels', 'prefix', 'autopurge', 'autocorrect', 'requirerule', 'messagelogs', 'timezone', 'alias', 'rule', 'lock', 'unlock'].includes(commandName) && !isManager) {
            return interaction.reply({ content: 'you need **Manage Channels** to use this command.', ephemeral: true });
        }

        if (commandName === 'prefix') {
            const sub = options.getSubcommand();
            const current = await getPrefix(guildId);
            if (sub === 'show') {
                return interaction.reply({ content: `the prefix is \`${current}\`. change it with \`/prefix set\` or \`/prefix reset\`.`, ephemeral: true });
            }

            const wanted = options.getString('prefix');
            if (sub === 'set' && !/^[^\s`@<>]{1,5}$/.test(wanted || '')) {
                return interaction.reply({ content: 'a prefix is 1 to 5 characters with no spaces, backticks, @, < or >.', ephemeral: true });
            }
            await setPrefix(guildId, sub === 'reset' ? null : wanted);
            const now = await getPrefix(guildId);
            const replied = interaction.reply({ content: `prefix is now \`${now}\`.`, ephemeral: true });
            sendLog(interaction.guild, {
                title: 'prefix changed',
                kind: 'server',
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'before', value: `\`${current}\``, inline: true },
                    { name: 'now', value: `\`${now}\``, inline: true }
                ]
            }).catch(err => console.error('log write error:', err));
            return replied;
        }

        if (commandName === 'autopurge') {
            const target = options.getString('target');
            const wanted = options.getBoolean('enabled');
            const current = await getAutoPurge(guildId);
            if (!target || wanted === null || wanted === undefined) {
                return interaction.reply({ content: `**auto-purge settings**\n**commands**: ${current.commands ? 'on' : 'off'} (delete the prefix command and the bot's reply right after it runs)\n**parent**: ${current.parent ? 'on' : 'off'} (delete the message being cited or infractioned once it is logged)\nchange one with \`/autopurge target:<commands|parent> enabled:<true|false>\`.`, ephemeral: true });
            }
            await setAutoPurge(guildId, target, wanted);
            const replied = interaction.reply({ content: `auto-purge **${target}** is now **${wanted ? 'on' : 'off'}**.`, ephemeral: true });
            logInBackground(interaction.guild, {
                title: 'auto-purge changed',
                kind: 'server',
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'setting', value: target, inline: true },
                    { name: 'before / now', value: `${current[target] ? 'on' : 'off'} / ${wanted ? 'on' : 'off'}`, inline: true }
                ]
            });
            return replied;
        }

        if (commandName === 'autocorrect') {
            const wanted = options.getBoolean('enabled');
            const current = (await getAutoPurge(guildId)).correct;
            if (wanted === null || wanted === undefined) {
                return interaction.reply({ content: `autocorrect is **${current ? 'on' : 'off'}**. when on, a mistyped prefix command that can only mean one thing runs anyway (for example \`!infractions view\` or \`!purg 5\`); if it could mean several, okite asks which. only command words are corrected, never users, rules, ids or reasons. change it with \`/autocorrect enabled:true|false\`.`, ephemeral: true });
            }
            await setAutoPurge(guildId, 'correct', wanted);
            const replied = interaction.reply({ content: `autocorrect is now **${wanted ? 'on' : 'off'}**.`, ephemeral: true });
            logInBackground(interaction.guild, {
                title: 'autocorrect changed',
                kind: 'server',
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'before', value: current ? 'on' : 'off', inline: true },
                    { name: 'now', value: wanted ? 'on' : 'off', inline: true }
                ]
            });
            return replied;
        }

        if (commandName === 'requirerule') {
            const wanted = options.getBoolean('enabled');
            const current = (await getAutoPurge(guildId)).requireRule;
            if (wanted === null || wanted === undefined) {
                return interaction.reply({ content: `requiring a rule is **${current ? 'on' : 'off'}**. when on, ban, kick, softban, mute and infraction add need a rule id (or \`custom\` with a reason); when off, a rule is optional and no rule is recorded as custom.`, ephemeral: true });
            }
            await setAutoPurge(guildId, 'rule', wanted);
            const replied = interaction.reply({ content: `requiring a rule is now **${wanted ? 'on' : 'off'}**.`, ephemeral: true });
            logInBackground(interaction.guild, {
                title: 'rule requirement changed',
                kind: 'server',
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'before', value: current ? 'on' : 'off', inline: true },
                    { name: 'now', value: wanted ? 'on' : 'off', inline: true }
                ]
            });
            return replied;
        }

        if (commandName === 'messagelogs') {
            const wanted = options.getBoolean('enabled');
            const current = (await getAutoPurge(guildId)).messageLogs;
            if (wanted === null || wanted === undefined) {
                return interaction.reply({ content: `message logs are **${current ? 'on' : 'off'}**. when on, okite keeps a 72 hour copy of messages so edits and deletes are logged with their text, and ban transcripts are built; when off (the default) nothing is stored and none of that happens.`, ephemeral: true });
            }
            await setAutoPurge(guildId, 'messagelogs', wanted);
            const replied = interaction.reply({ content: `message logs are now **${wanted ? 'on' : 'off'}**.${wanted ? '' : ' messages already stored are removed within 72 hours.'}`, ephemeral: true });
            logInBackground(interaction.guild, {
                title: 'message logs changed',
                kind: 'server',
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'before', value: current ? 'on' : 'off', inline: true },
                    { name: 'now', value: wanted ? 'on' : 'off', inline: true }
                ]
            });
            return replied;
        }

        if (commandName === 'timezone') {
            const input = options.getString('zone');
            const current = await getTimezone(guildId);
            const now = () => `it is ${clockText(new Date(), zone)} there now`;
            let zone = current;
            if (!input) {
                return interaction.reply({ content: `the timezone is **${current}**${(await getAutoPurge(guildId)).timezone ? '' : ' (the default)'}; ${now()}. set it with \`/timezone UTC+5:30\` or a name like \`Asia/Kolkata\`, and \`reset\` goes back to the default.`, ephemeral: true });
            }
            const reset = /^(reset|default|clear)$/i.test(input.trim());
            const parsed = reset ? { zone: null } : parseTimezone(input);
            if (!parsed) return interaction.reply({ content: `\`${clip(input, 40)}\` is not a time zone. use an offset like \`UTC+5:30\` or \`-4\`, or a name like \`Asia/Kolkata\`.`, ephemeral: true });
            await setAutoPurge(guildId, 'timezone', parsed.zone);
            zone = parsed.zone || DEFAULT_ZONE;
            const replied = interaction.reply({ content: `the timezone is now **${zone}**${reset ? ' (the default)' : ''}; ${now()}.`, ephemeral: true });
            logInBackground(interaction.guild, {
                title: 'timezone changed',
                kind: 'server',
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'before', value: current, inline: true },
                    { name: 'now', value: zone, inline: true }
                ]
            });
            return replied;
        }

        if (commandName === 'alias') {
            const sub = options.getSubcommand();
            const aliases = await getAliases(guildId);
            const prefix = await getPrefix(guildId);
            if (sub === 'list') {
                if (!aliases.size) return interaction.reply({ content: `no aliases yet. make one with \`/alias add\`, for example name \`warn\`, command \`infraction add\`.`, ephemeral: true });
                return interaction.reply({ content: [...aliases].map(([n, c]) => `\`${prefix}${n}\` runs \`${prefix}${c}\``).join('\n'), ephemeral: true });
            }

            const name = (options.getString('name') || '').trim().toLowerCase().replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
            if (sub === 'remove') {
                if (!aliases.has(name)) return interaction.reply({ content: `there is no alias called \`${name}\`.`, ephemeral: true });
                const next = new Map(aliases);
                next.delete(name);
                await saveAliases(guildId, next);
                logInBackground(interaction.guild, { title: 'alias removed', kind: 'server', color: COLORS.danger, fields: [{ name: 'moderator', value: who(interaction.user), inline: true }, { name: 'alias', value: `${prefix}${name}`, inline: true }] });
                return interaction.reply({ content: `removed \`${prefix}${name}\`.`, ephemeral: true });
            }

            const command = (options.getString('command') || '').trim().replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
            const problem = checkAlias(name, command, aliases);
            if (problem) return interaction.reply({ content: problem, ephemeral: true });
            const replaced = aliases.has(name);
            const next = new Map(aliases).set(name, command);
            await saveAliases(guildId, next);
            logInBackground(interaction.guild, { title: replaced ? 'alias updated' : 'alias added', kind: 'server', fields: [{ name: 'moderator', value: who(interaction.user), inline: true }, { name: 'alias', value: `${prefix}${name}`, inline: true }, { name: 'runs', value: `${prefix}${command}` }] });
            return interaction.reply({ content: `\`${prefix}${name}\` now runs \`${prefix}${command}\`${replaced ? ' (replaced the old one)' : ''}.\n${aliasSlotNotes(command)}`, ephemeral: true });
        }

        if (commandName === 'help') {
            if (!isMod) return interaction.reply({ content: 'you need **Manage Messages** to use this command.', ephemeral: true });
            return interaction.reply({ ...renderHelp(await getPrefix(guildId), options.getString('command')), ephemeral: true });
        }

        if (commandName === 'ping') {
            const started = Date.now();
            await interaction.reply({ content: 'pinging…', ephemeral: true });
            const apiMs = Date.now() - started;

            const timed = async (fn) => { const t = Date.now(); try { await fn(); return `${Date.now() - t} ms`; } catch { return 'error'; } };
            const [supabaseMs, mongoMs] = await Promise.all([
                supabase ? timed(async () => { const { error } = await supabase.from('infractions').select('case_number').limit(1); if (error) throw error; }) : null,
                process.env.MONGODB_URI ? timed(() => Guild.findOne({ guildId: '0' }).lean()) : null
            ]);
            const ws = client.ws?.ping;
            const lines = [
                `**websocket:** ${typeof ws === 'number' && ws >= 0 ? `${Math.round(ws)} ms` : 'not measured yet'}`,
                `**api:** ${apiMs} ms`,
                ...(supabaseMs ? [`**supabase:** ${supabaseMs}`] : []),
                ...(mongoMs ? [`**mongodb:** ${mongoMs}`] : []),
                ...(!supabaseMs && !mongoMs ? ['**database:** not configured'] : []),
                `**uptime:** ${formatDuration(process.uptime() * 1000)}`
            ];
            return interaction.editReply(lines.join('\n'));
        }

        if (commandName === 'logchannels') {
            const guildConfig = process.env.MONGODB_URI ? await Guild.findOne({ guildId }) : null;
            const lines = Object.entries(LOG_KINDS).map(([kind, key]) => {
                const id = (guildConfig && guildConfig[key]) || config[key] || (kind === 'general' ? process.env.LOG_CHANNEL_ID : null);
                const shown = id ? `<#${id}>` : (kind === 'general' ? 'not set (falls back to a channel named logs or mod-logs)' : 'not set (uses general)');
                return `**${kind}**: ${shown}`;
            });
            return interaction.reply({ content: lines.join('\n'), ephemeral: true });
        }

        if (commandName === 'setlog') {
            const channel = options.getChannel('channel');
            const reset = options.getBoolean('reset') ?? false;
            const kind = options.getString('type') || 'general';
            const key = LOG_KINDS[kind];
            if (!reset && !channel) {
                return interaction.reply({ content: 'pick a channel, or set `reset` to clear this log type.', ephemeral: true });
            }
            if (!reset && !(channel.isTextBased?.() && typeof channel.send === 'function')) {
                return interaction.reply({ content: `${channel} is a ${channel.type === 4 ? 'category' : 'channel type'} the bot can't send messages in. pick a text channel.`, ephemeral: true });
            }
            const value = reset ? null : channel.id;

            if (process.env.MONGODB_URI) {
                await Guild.findOneAndUpdate(
                    { guildId },
                    { [key]: value },
                    { upsert: true, new: true }
                );
                guildConfigCache.delete(guildId);
            } else {
                config[key] = value;
                fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
            }
            const replied = reset
                ? interaction.reply({ content: `${kind} log channel cleared${kind === 'general' ? ' (falls back to a channel named logs or mod-logs).' : ', it now uses the general log channel.'}`, ephemeral: true })
                : interaction.reply({ content: `${kind} log channel set to <#${channel.id}>.${kind === 'general' ? '' : ' (falls back to the general log channel if unset)'}`, ephemeral: true });
            sendLog(interaction.guild, {
                title: reset ? `${kind} log channel cleared` : `${kind} log channel changed`,
                kind: 'server',
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'type', value: kind, inline: true },
                    { name: reset ? 'now' : 'new channel', value: reset ? (kind === 'general' ? 'cleared' : 'uses general') : `<#${channel.id}>`, inline: true }
                ]
            }).catch(err => console.error('log write error:', err));
            return replied;
        }

        if (commandName === 'rule') {
            const subcommand = options.getSubcommand();

            if (!process.env.MONGODB_URI && subcommand !== 'list') {
                return interaction.reply({ content: 'rules need a database. set `MONGODB_URI` on this instance.', ephemeral: true });
            }

            if (subcommand === 'add') {
                const modal = new ModalBuilder()
                    .setCustomId('rule_add_modal')
                    .setTitle('Add Server Rule');

                const idInput = new TextInputBuilder()
                    .setCustomId('rule_id')
                    .setLabel('Rule ID (e.g. r1)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('r1')
                    .setRequired(true);

                const labelInput = new TextInputBuilder()
                    .setCustomId('rule_label')
                    .setLabel('Rule Label / Title')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Rule 1: Civility Rule')
                    .setRequired(true);

                const descInput = new TextInputBuilder()
                    .setCustomId('rule_desc')
                    .setLabel('Short Description (dropdown hover)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Be kind and respectful')
                    .setRequired(true);

                const textInput = new TextInputBuilder()
                    .setCustomId('rule_text')
                    .setLabel('Full Rule Text (markdown supported)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('>>> **Rule #1**\nBe kind and helpful...')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(idInput),
                    new ActionRowBuilder().addComponents(labelInput),
                    new ActionRowBuilder().addComponents(descInput),
                    new ActionRowBuilder().addComponents(textInput)
                );

                return interaction.showModal(modal);
            }

            if (subcommand === 'remove') {
                const targetId = options.getString('id');
                const guildConfig = await Guild.findOne({ guildId });

                if (!guildConfig || !guildConfig.rules.some(r => r.id === targetId)) {
                    return interaction.reply({ content: `rule \`${targetId}\` not found in database.`, ephemeral: true });
                }

                guildConfig.rules = guildConfig.rules.filter(r => r.id !== targetId);
                await guildConfig.save();
                logInBackground(interaction.guild, {
                    title: 'rule removed',
                    kind: 'server',
                    color: COLORS.danger,
                    fields: [
                        { name: 'moderator', value: who(interaction.user), inline: true },
                        { name: 'rule id', value: `\`${targetId}\``, inline: true }
                    ]
                });
                return interaction.reply({ content: `removed rule \`${targetId}\`.`, ephemeral: true });
            }

            if (subcommand === 'list') {
                return interaction.reply({ ...renderRuleList(await getServerRules(guildId), 0, await guildLook(interaction.guild)), ephemeral: true });
            }
        }

        if (commandName === 'lock' || commandName === 'unlock') {
            const isLocking = commandName === 'lock';
            const targetChannel = options.getChannel('channel') || interaction.channel;

            if (!targetChannel.isTextBased()) {
                return interaction.reply({ content: 'target must be a text channel.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            let affectedRoleIds = [];

            if (isLocking) {
                let lockedRoleIds = [];
                let everyoneOverwrite = targetChannel.permissionOverwrites.cache.get(interaction.guild.id);
                
                const everyoneWasDenied = everyoneOverwrite && everyoneOverwrite.deny.has(PermissionFlagsBits.SendMessages);
                if (!everyoneWasDenied) {
                    lockedRoleIds.push(interaction.guild.id);
                }

                targetChannel.permissionOverwrites.cache.forEach((overwrite, id) => {
                    if (overwrite.type === 0 && id !== interaction.guild.id) {
                        if (overwrite.allow.has(PermissionFlagsBits.SendMessages)) {
                            lockedRoleIds.push(id);
                        }
                    }
                });

                affectedRoleIds = lockedRoleIds;

                for (const roleId of lockedRoleIds) {
                    await targetChannel.permissionOverwrites.edit(roleId, {
                        SendMessages: false,
                        SendMessagesInThreads: false
                    }).catch(() => null);
                }

                if (everyoneWasDenied) {
                    await targetChannel.permissionOverwrites.edit(interaction.guild.id, {
                        SendMessages: false,
                        SendMessagesInThreads: false
                    }).catch(() => null);
                }

                if (process.env.MONGODB_URI) {
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guildId },
                        { $pull: { lockedChannels: { channelId: targetChannel.id } } }
                    );
                    await Guild.findOneAndUpdate(
                        { guildId: interaction.guildId },
                        { $push: { lockedChannels: { channelId: targetChannel.id, lockedRoleIds } } }
                    );
                }
            } else {
                let rolesToRestore = [];
                let dbRecordFound = false;

                if (process.env.MONGODB_URI) {
                    const guildConfig = await Guild.findOne({ guildId: interaction.guildId });
                    const record = guildConfig?.lockedChannels?.find(c => c.channelId === targetChannel.id);
                    if (record) {
                        rolesToRestore = record.lockedRoleIds;
                        dbRecordFound = true;

                        guildConfig.lockedChannels = guildConfig.lockedChannels.filter(c => c.channelId !== targetChannel.id);
                        await guildConfig.save();
                    }
                }

                if (!dbRecordFound) {
                    targetChannel.permissionOverwrites.cache.forEach((overwrite, id) => {
                        if (overwrite.type === 0 && id !== interaction.guild.id) {
                            if (overwrite.deny.has(PermissionFlagsBits.SendMessages)) {
                                rolesToRestore.push(id);
                            }
                        }
                    });
                    if (rolesToRestore.length === 0) {
                        rolesToRestore.push(interaction.guild.id);
                    }
                }

                affectedRoleIds = rolesToRestore;

                for (const roleId of rolesToRestore) {
                    if (roleId === interaction.guild.id) {
                        await targetChannel.permissionOverwrites.edit(roleId, {
                            SendMessages: null,
                            SendMessagesInThreads: null
                        }).catch(() => null);
                    } else {
                        await targetChannel.permissionOverwrites.edit(roleId, {
                            SendMessages: true,
                            SendMessagesInThreads: true
                        }).catch(() => null);
                    }
                }
            }

            const notice = isLocking ? 'channel locked.' : 'channel unlocked.';

            logInBackground(interaction.guild, {
                title: isLocking ? 'channel locked' : 'channel unlocked',
                kind: 'moderation',
                color: isLocking ? COLORS.danger : COLORS.good,
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'channel', value: `<#${targetChannel.id}>`, inline: true },
                    { name: isLocking ? 'roles locked' : 'roles restored', value: affectedRoleIds.map(id => id === interaction.guild.id ? '@everyone' : `<@&${id}>`).join(', ') }
                ]
            });

            await targetChannel.send(notice).catch(() => null);
            return interaction.editReply(`channel <#${targetChannel.id}> ${isLocking ? 'locked' : 'unlocked'}.`);
        }

        if (MOD_ACTIONS[commandName]) {
            const spec = MOD_ACTIONS[commandName];
            if (!(perms.has(spec.flag) || perms.has(PermissionFlagsBits.Administrator))) {
                return interaction.reply({ content: `you need **${spec.label}** to use this command.`, ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            return runModAction(interaction, commandName);
        }

        if (commandName === 'ban') {
            if (!(perms.has(PermissionFlagsBits.BanMembers) || perms.has(PermissionFlagsBits.Administrator))) {
                return interaction.reply({ content: 'you need **Ban Members** to use this command.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });

            const target = options.getUser('user');
            const urgent = options.getBoolean('urgent') ?? false;
            const durationInput = options.getString('duration');
            const banDuration = durationInput ? parseDuration(durationInput) : null;
            if (durationInput && !banDuration) return interaction.editReply(BAD_DURATION);
            const resolved = await resolveRuleFields(guildId, options.getString('rule'), options.getString('reason') || 'no reason given');
            if (resolved.error) return interaction.editReply(resolved.error);
            const reason = resolved.reason;

            if (target.id === interaction.user.id || target.id === client.user.id) {
                return interaction.editReply('you can\'t ban that user.');
            }
            const member = await interaction.guild.members.fetch(target.id).catch(() => null);
            if (member) {
                if (!member.bannable) return interaction.editReply('okite can\'t ban that user (their top role is above okite\'s, or they own the server).');
                if (interaction.guild.ownerId !== interaction.user.id && interaction.member.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
                    return interaction.editReply('their top role is as high as yours or higher.');
                }
            }

            const key = `${interaction.guildId}:${target.id}`;
            botBans.add(key);
            try {
                await interaction.guild.members.ban(target, {
                    deleteMessageSeconds: urgent ? 7 * 24 * 60 * 60 : 0,
                    reason: `${interaction.user.tag}: ${reason}`.slice(0, 500)
                });
            } catch (err) {
                botBans.delete(key);
                return interaction.editReply(`ban failed: ${err.message}`);
            }
            setTimeout(() => botBans.delete(key), 30000).unref();

            const infraction = await createInfraction({
                guild_id: interaction.guildId,
                target_user_id: target.id,
                moderator_id: interaction.user.id,
                rule_id: resolved.ruleId,
                rule_text_snapshot: resolved.ruleId ? resolved.snapshot : (urgent ? `${reason} (urgent: messages deleted immediately, nothing saved)` : reason),
                ...(resolved.reasonColumn ? { reason: urgent ? `${resolved.reasonColumn} (urgent: messages deleted immediately, nothing saved)` : resolved.reasonColumn } : {}),
                action_type: 'ban',
                ...durationColumns(banDuration)
            });
            const timed = banDuration && !banDuration.permanent;

            const logsOn = await messageLogsOn(interaction.guildId);
            const logReady = logsOn && Boolean(await getLogChannel(interaction.guild, 'citation'));
            const askNoLog = !urgent && infraction && supabase && logsOn && !logReady;
            await interaction.editReply({ components: askNoLog ? [noLogButtons(target.id, infraction.case_number)] : [], content:
                `banned **${target.username}**${timed ? ` for ${banDuration.label}` : ''}${infraction ? ` (infraction #${infraction.case_number})` : ''}.` +
                (timed && timedColumnsMissing() ? ' the database is missing the duration columns (run db/infractions_duration.sql), so this ban will not lift itself.' : '') +
                (urgent
                    ? ' their last 7 days of messages were deleted immediately and nothing was saved. if this was illegal content, report it with Discord\'s Report Message and to your national hotline.'
                    : (!supabase ? ' (no database configured, so no transcript or snapshot.)' : !logsOn ? ` ${NO_LOGS_NOTE}` : logReady ? ' building the transcript now.' : ` ${NO_LOG_CHOICE}`))
            });

            logInBackground(interaction.guild, {
                title: infraction ? `${urgent ? 'urgent ban' : 'member banned'}: infraction #${infraction.case_number}` : (urgent ? 'urgent ban' : 'member banned'),
                kind: 'moderation',
                color: COLORS.danger,
                fields: [
                    { name: 'user', value: who(target), inline: true },
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'reason', value: reason },
                    { name: 'duration', value: banDuration ? banDuration.label : 'Permanent', inline: true },
                    { name: 'mode', value: urgent ? 'urgent: history deleted immediately, nothing saved' : 'messages kept until staff decide' }
                ]
            });

            if (!urgent && infraction && supabase && logReady) {
                runBanSnapshot({
                    guild: interaction.guild,
                    target,
                    infraction,
                    moderatorId: interaction.user.id,
                    deleteAfter: true,
                    notify: (text) => interaction.followUp({ content: text, ephemeral: true }).catch(() => null)
                }).catch(err => console.error('ban snapshot error:', err));
            }
            return;
        }

        if (commandName === 'purge') {
            if (!isMod) {
                return interaction.reply({ content: 'you need **Manage Messages** to use this command.', ephemeral: true });
            }
            const users = ['user1', 'user2', 'user3']
                .map(n => options.getUser(n))
                .filter((u, i, arr) => u && arr.findIndex(x => x?.id === u.id) === i);
            return runCountPurge(interaction, { count: options.getInteger('count'), users });
        }

        if (commandName === 'infraction') {
            if (!isMod) {
                return interaction.reply({ content: 'you need **Manage Messages** to use this command.', ephemeral: true });
            }
            if (!supabase) {
                return interaction.reply({ content: 'infractions aren\'t configured on this instance.', ephemeral: true });
            }

            const sub = options.getSubcommand();
            await interaction.deferReply({ ephemeral: true });

            if (sub === 'view') {
                const id = options.getInteger('id');
                const row = await getInfraction(guildId, id);
                if (!row) return interaction.editReply(`infraction #${id} not found.`);
                return interaction.editReply(await renderInfractionCard({ guild: interaction.guild, row }));
            }

            if (sub === 'user' || sub === 'moderator') {
                const target = options.getUser('user');
                const payload = await renderInfractionList({ guild: interaction.guild, sub, target });
                if (!payload.total) return interaction.editReply(payload);

                logInBackground(interaction.guild, {
                    title: sub === 'user' ? 'infraction history viewed' : 'moderator history viewed',
                    kind: 'citation',
                    color: COLORS.muted,
                    fields: [
                        { name: 'moderator', value: who(interaction.user), inline: true },
                        { name: 'target', value: who(target), inline: true },
                        { name: 'records', value: String(payload.total), inline: true }
                    ]
                });
                return interaction.editReply(payload);
            }

            if (sub === 'recent') {
                const { data, error } = await supabase
                    .from('infractions')
                    .select('*')
                    .eq('guild_id', guildId)
                    .order('case_number', { ascending: false })
                    .limit(15);
                if (error) {
                    console.error('infraction recent error:', error);
                    return interaction.editReply('failed to fetch infractions.');
                }
                if (!data.length) return interaction.editReply('no infractions recorded yet.');
                const labels = Object.fromEntries((await getServerRules(guildId)).map(r => [r.id, r.label]));
                const names = Object.fromEntries(data.map(r => [r.target_user_id, client.users.cache.get(r.target_user_id)?.username]).filter(([, n]) => n));
                const table = renderInfractionBlocks(paginateBlocks(buildInfractionBlocks(data, labels, { showTarget: true, names, zone: await getTimezone(guildId) }))[0]);
                if (USE_CONTAINERS) {
                    const shownEntries = paginateEntries(data.map(r => infractionEntry(r, labels, { showTarget: true })), PLAIN_ENTRIES_PER_PAGE)[0];
                    const container = containerHeader(new ContainerBuilder().setAccentColor(COLORS.danger), `## recent infractions\n-# the latest ${shownEntries.length} in this server`, okiteIcon());
                    container.addSeparatorComponents(divider());
                    addEntries(container, shownEntries);
                    return interaction.editReply({ flags: V2_FLAG, components: [container] });
                }
                const embed = new EmbedBuilder().setTitle('recent infractions').setColor(COLORS.danger).setDescription(table);
                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'add') {
                const target = options.getUser('user');
                const reasonText = options.getString('reason') || 'not specified';
                const ruleInput = options.getString('rule');
                if (target.bot) return interaction.editReply('can\'t record an infraction against a bot.');

                const durationInput = options.getString('duration');
                const parsedDuration = durationInput ? parseDuration(durationInput) : null;
                if (durationInput && !parsedDuration) return interaction.editReply(BAD_DURATION);

                const resolved = await resolveRuleFields(guildId, ruleInput, reasonText);
                if (resolved.error) return interaction.editReply(resolved.error);
                const { ruleId, snapshot, reasonColumn, reason } = resolved;

                const parent = interaction.parentMessage && interaction.parentMessage.author.id === target.id ? interaction.parentMessage : null;

                const row = await createInfraction({
                    guild_id: guildId,
                    target_user_id: target.id,
                    moderator_id: interaction.user.id,
                    rule_id: ruleId,
                    rule_text_snapshot: snapshot,
                    ...(reasonColumn ? { reason: reasonColumn } : {}),
                    action_type: 'manual',
                    message_link: parent?.url ?? null,
                    message_content: parent?.content || null,
                    ...durationColumns(parsedDuration)
                });
                if (!row) return interaction.editReply('failed to record the infraction.');

                const fields = [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'user', value: who(target), inline: true },
                    { name: 'rule', value: ruleId ? `\`${ruleId}\`` : 'custom', inline: true },
                    { name: 'rule-text', value: ruleId ? quotedRuleText(snapshot, 1000) : '' },
                    { name: 'reason', value: clip(reason) },
                    { name: 'duration', value: parsedDuration ? parsedDuration.label : 'Permanent', inline: true }
                ];
                if (parent) {
                    fields.push(
                        { name: 'channel', value: `<#${parent.channelId}>`, inline: true },
                        { name: 'sent at', value: parent.createdAt.toISOString(), inline: true },
                        { name: 'message id', value: parent.id, inline: true },
                        { name: 'cited message', value: clip(parent.content) || '*(no text)*' },
                        { name: 'files (not saved)', value: Array.from(parent.attachments.values()).map(describeAttachment).join('\n') },
                        { name: 'jump', value: parent.url }
                    );
                }
                const payload = { title: `infraction #${row.case_number} added`, kind: 'citation', color: COLORS.danger, fields };

                if (parent && (await getAutoPurge(guildId)).parent) {
                    const logged = await sendLog(interaction.guild, payload);
                    if (!logged) return interaction.editReply(`recorded infraction **#${row.case_number}**, but could not write to the log channel, so the message was left in place.`);
                    await Promise.all([
                        parent.delete().catch(() => null),
                        interaction.editReply(`recorded infraction **#${row.case_number}** for **${target.username}** and deleted the message.`)
                    ]);
                    return;
                }

                logInBackground(interaction.guild, payload);
                return interaction.editReply(`recorded infraction **#${row.case_number}** for **${target.username}**.`);
            }

            if (sub === 'edit') {
                return editInfractionReason(interaction, options.getInteger('id'), options.getString('reason'));
            }

            if (sub === 'void' || sub === 'restore') {
                return setInfractionVoid(interaction, options.getInteger('id'), sub === 'void', options.getString('reason'));
            }

            if (sub === 'delete') {
                return deleteInfraction(interaction, options.getInteger('id'));
            }
        }
    }

    const isRuleModal = interaction.isModalSubmit() && interaction.customId === 'rule_add_modal';
    const isBanPrompt = interaction.isButton() && interaction.customId.startsWith('ban_');
    const isRulePage = interaction.isButton() && interaction.customId.startsWith('rulepage:');
    const canBan = perms && (perms.has(PermissionFlagsBits.BanMembers) || perms.has(PermissionFlagsBits.Administrator));
    if (!isMod && !(isRuleModal && isManager) && !(isRulePage && isManager) && !(isBanPrompt && canBan)) {
        return interaction.reply({ content: isBanPrompt ? 'you need **Ban Members** to decide this.' : 'missing permission.', ephemeral: true });
    }
    if (isBanPrompt && !canBan) {
        return interaction.reply({ content: 'you need **Ban Members** to decide this.', ephemeral: true });
    }

    if (interaction.isMessageContextMenuCommand()) {
        const { commandName, targetMessage, user } = interaction;
        const targetUser = targetMessage.author;
    
        if (commandName.toLowerCase() === 'mark / purge range') {
            const start = markedpurgestarts.get(user.id); 

            if (!start || start.channelId !== interaction.channelId) {
                markedpurgestarts.set(user.id, {
                    channelId: interaction.channelId,
                    messageId: targetMessage.id
                });
                return interaction.reply({ 
                    content: 'initial point marked. right-click the endpoint and select **mark / purge range** to purge the range.', 
                    ephemeral: true 
                });
            }

            await interaction.deferReply({ ephemeral: true });

            if (!interaction.channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ManageMessages)) {
                markedpurgestarts.delete(user.id);
                return interaction.editReply('okite is missing **Manage Messages** in this channel, cannot purge.');
            }

            try {
                const { messages: fetched, startFound, endFound } = await fetchRangeMessages(interaction.channel, start.messageId, targetMessage.id);

                if (!startFound || !endFound) {
                    markedpurgestarts.delete(user.id);
                    return interaction.editReply("couldn't locate both ends of the range (searched back 1000 messages). purge cancelled.");
                }

                const msgArray = fetched.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

                const startIndex = msgArray.findIndex(m => m.id === start.messageId);
                const endIndex = msgArray.findIndex(m => m.id === targetMessage.id);

                const minIndex = Math.min(startIndex, endIndex);
                const maxIndex = Math.max(startIndex, endIndex);

                const toDelete = msgArray.slice(minIndex, maxIndex + 1);
                return await executePurge(interaction, toDelete, {
                    label: 'purge range',
                    detailFields: [
                        { name: 'range start', value: start.messageId, inline: true },
                        { name: 'range end', value: targetMessage.id, inline: true }
                    ]
                });
            } catch (error) {
                console.error(error);
                return interaction.editReply(`failed to purge messages: ${error.message}`);
            }
        }

        if (commandName === 'lookup') {
            let serverRules = rules;
            if (process.env.MONGODB_URI) {
                const guildConfig = await Guild.findOne({ guildId: interaction.guildId });
                if (guildConfig && guildConfig.rules.length > 0) {
                    serverRules = guildConfig.rules;
                }
            }

            const options = serverRules.map(rule => ({
                label: rule.label,
                description: rule.desc || rule.description,
                value: rule.id
            }));

            options.push({
                label: 'custom',
                description: 'provide manually, reason(s) for this action.',
                value: 'custom'
            });

            const customId = `${commandName}:${targetUser.id}:${targetMessage.id}`;
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(customId)
                .setPlaceholder('select a rule violation')
                .addOptions(options);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.reply({
                content: `select a rule for **${commandName}** on **${targetUser.username}**:`,
                components: [row],
                ephemeral: true
            });
        }

        if (commandName.toLowerCase() === 'reply') {
            const modal = new ModalBuilder()
                .setCustomId(`reply_modal:${targetMessage.id}`)
                .setTitle('reply as Okite');

            const replyInput = new TextInputBuilder()
                .setCustomId('reply_text')
                .setLabel('reply message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('type your reply here...')
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(replyInput);
            modal.addComponents(row);

            return interaction.showModal(modal);
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('logid:')) {
        return interaction.reply({ content: '```\n' + interaction.customId.slice('logid:'.length) + '\n```', ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith('rulepage:')) {
        return interaction.update(renderRuleList(await getServerRules(interaction.guildId), Number.parseInt(interaction.customId.split(':')[1], 10) || 0, await guildLook(interaction.guild)));
    }

    if (interaction.isButton() && interaction.customId.startsWith('nolog_')) {
        const [action, userId, caseNumber] = interaction.customId.split(':');
        if (action === 'nolog_keep') {
            return interaction.update({ content: `left their messages in place (infraction #${caseNumber}), decided by ${interaction.user}.`, components: [], allowedMentions: { parse: [] } });
        }
        await interaction.deferUpdate();
        const { messages } = await fetchSnapshot(interaction.guild, await getIndexedRefs(interaction.guildId, userId));
        if (messages.length) await deleteSnapshotMessages(interaction.guild, messages);
        console.log(`purged ${messages.length} message(s) for infraction #${caseNumber} with no transcript, decided by ${interaction.user.id}`);
        return interaction.editReply({ content: `${messages.length} message(s) purged without a transcript (infraction #${caseNumber}), decided by ${interaction.user}.`, components: [], allowedMentions: { parse: [] } });
    }

    if (interaction.isButton() && interaction.customId.startsWith('ban_')) {
        const [action, id] = interaction.customId.split(':');
        const pending = supabase ? await claimPendingBan(id) : null;
        const containerPrompt = interaction.message?.components?.[0]?.type === ComponentType.Container;
        if (!pending || pending.guild_id !== interaction.guildId) {
            const note = 'this prompt was already handled or has expired.';
            return interaction.update(containerPrompt ? { components: [noticeContainer(note)] } : { content: note, components: [] });
        }

        await interaction.deferUpdate();
        const summary = await finalizeBan(interaction.guild, pending, { save: action === 'ban_save', by: interaction.user });
        if (containerPrompt) return;
        return interaction.editReply({ content: `${summary} decided by ${interaction.user}.`, components: [], allowedMentions: { parse: [] } });
    }

    if (interaction.isButton() && interaction.customId.startsWith('infact:')) {
        const [, action, ref] = interaction.customId.split(':');
        if (!supabase) return interaction.reply({ content: 'infractions aren\'t configured on this instance.', ephemeral: true });

        if (action === 'edit' || action === 'void') {
            const row = await getInfraction(interaction.guildId, Number.parseInt(ref, 10));
            if (!row) return interaction.reply({ content: `infraction #${ref} not found.`, ephemeral: true });
            const input = new TextInputBuilder()
                .setCustomId('text')
                .setLabel(action === 'edit' ? 'New reason' : 'Why is it being voided?')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(action === 'edit' ? 1000 : 500)
                .setRequired(true);
            if (action === 'edit') {
                const current = row.rule_id && row.rule_id !== 'custom' ? row.reason : row.rule_text_snapshot;
                if (current && current !== 'not specified') input.setValue(String(current).slice(0, 1000));
            }
            return interaction.showModal(new ModalBuilder()
                .setCustomId(`infmodal:${action}:${ref}`)
                .setTitle(`${action === 'edit' ? 'Edit' : 'Void'} infraction #${ref}`)
                .addComponents(new ActionRowBuilder().addComponents(input)));
        }

        await interaction.deferReply({ ephemeral: true });
        if (action === 'view') {
            const row = await getInfraction(interaction.guildId, Number.parseInt(ref, 10));
            if (!row) return interaction.editReply(`infraction #${ref} not found.`);
            return interaction.editReply(await renderInfractionCard({ guild: interaction.guild, row }));
        }
        if (action === 'restore') return setInfractionVoid(interaction, Number.parseInt(ref, 10), false, null);
        if (action === 'history') {
            const target = await client.users.fetch(ref).catch(() => ({ id: ref, username: ref }));
            return interaction.editReply(await renderInfractionList({ guild: interaction.guild, sub: 'user', target }));
        }
        return interaction.editReply('unknown action.');
    }

    if (interaction.isButton() && interaction.customId.startsWith('infpage:')) {
        const [, sub, targetId, page] = interaction.customId.split(':');
        if (!supabase) return interaction.update({ content: 'infractions aren\'t configured on this instance.', embeds: [], components: [] });
        const target = await client.users.fetch(targetId).catch(() => ({ id: targetId, username: targetId }));
        const payload = await renderInfractionList({ guild: interaction.guild, sub, target, page: Number.parseInt(page, 10) || 0 });
        try {
            return await interaction.update(asMessage(payload));
        } catch (err) {
            console.error('history page update error:', err.message);
            return interaction.reply({ ...asMessage(payload), ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        const { customId, values } = interaction;
        const [action, targetUserId, targetMessageId] = customId.split(':');
        const selectedValue = values[0];

        if (selectedValue === 'custom') {
            const modal = new ModalBuilder()
                .setCustomId(`modal:${action}:${targetUserId}:${targetMessageId}`)
                .setTitle(`Custom Reason for ${action.toUpperCase()}`);

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('type the reason here...')
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(reasonInput);
            modal.addComponents(row);

            return interaction.showModal(modal);
        }

        let serverRules = rules;
        if (process.env.MONGODB_URI) {
            const guildConfig = await Guild.findOne({ guildId: interaction.guildId });
            if (guildConfig && guildConfig.rules.length > 0) {
                serverRules = guildConfig.rules;
            }
        }

        const selectedRule = serverRules.find(r => r.id === selectedValue);
        if (!selectedRule) return interaction.reply({ content: 'rule not found.', ephemeral: true });

        await handleModerationAction(interaction, action, targetUserId, targetMessageId, selectedRule.text, selectedRule.id);
    }

    if (interaction.isModalSubmit()) {
        const { customId, fields } = interaction;

        if (customId === 'rule_add_modal') {
            if (!isManager) {
                return interaction.reply({ content: 'you need **Manage Channels** to use this.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            const id = fields.getTextInputValue('rule_id').trim();
            const label = fields.getTextInputValue('rule_label').trim();
            const desc = fields.getTextInputValue('rule_desc').trim();
            const text = fields.getTextInputValue('rule_text').trim();

            let guildConfig = await Guild.findOne({ guildId: interaction.guildId });
            if (!guildConfig) {
                guildConfig = new Guild({ guildId: interaction.guildId, rules: [] });
            }

            const existingIndex = guildConfig.rules.findIndex(r => r.id === id);
            if (existingIndex >= 0) {
                guildConfig.rules[existingIndex] = { id, label, desc, text };
            } else {
                guildConfig.rules.push({ id, label, desc, text });
            }

            await guildConfig.save();
            logInBackground(interaction.guild, {
                title: existingIndex >= 0 ? 'rule updated' : 'rule added',
                kind: 'server',
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'rule id', value: `\`${id}\``, inline: true },
                    { name: 'label', value: label },
                    { name: 'description', value: desc },
                    { name: 'text', value: quotedRuleText(text, 1000) }
                ]
            });
            return interaction.editReply(`added / updated rule \`${id}\` (${label}).`);
        }

        if (customId.startsWith('infmodal:')) {
            const [, action, ref] = customId.split(':');
            await interaction.deferReply({ ephemeral: true });
            const text = fields.getTextInputValue('text').trim();
            if (!text) return interaction.editReply('that can\'t be empty.');
            const id = Number.parseInt(ref, 10);
            return action === 'edit' ? editInfractionReason(interaction, id, text) : setInfractionVoid(interaction, id, true, text);
        }

        if (customId.startsWith('reply_modal:')) {
            await interaction.deferReply({ ephemeral: true });
            const targetMessageId = customId.split(':')[1];
            const replyText = fields.getTextInputValue('reply_text');

            const targetMessage = await interaction.channel.messages.fetch(targetMessageId).catch(() => null);
            if (!targetMessage) {
                return interaction.editReply(`original message not found.`);
            }

            await targetMessage.reply(replyText);

            logInBackground(interaction.guild, {
                title: 'staff reply',
                kind: 'moderation',
                color: COLORS.action,
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'replied to', value: who(targetMessage.author), inline: true },
                    { name: 'channel', value: `<#${interaction.channelId}>`, inline: true },
                    { name: 'original', value: clip(targetMessage.content), code: !!targetMessage.content },
                    { name: 'reply', value: clip(replyText), code: true },
                    { name: 'jump', value: targetMessage.url }
                ]
            });

            return interaction.editReply(`reply sent.`);
        }

        const [, action, targetUserId, targetMessageId] = customId.split(':');
        const reason = fields.getTextInputValue('reason');

        await handleModerationAction(interaction, action, targetUserId, targetMessageId, reason, 'custom');
    }
}

client.on(Events.InteractionCreate, (interaction) => {
    handleInteraction(interaction).catch(async (err) => {
        console.error('interaction error:', err);
        if (interaction.isAutocomplete?.()) return;
        const content = `something went wrong running that (${clip(String(err.message || err), 150)}), so it may not have finished. check the log channel before running it again.`;
        try {
            if (interaction.deferred || interaction.replied) await interaction.editReply({ content, components: [], embeds: [] });
            else await interaction.reply({ content, ephemeral: true });
        } catch { }
    });
});

async function handleModerationAction(interaction, action, targetUserId, targetMessageId, reason, ruleId = null) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;

    try {
        const targetMessage = await channel.messages.fetch(targetMessageId).catch(() => null);

        if (action === 'lookup') {
            if (!targetMessage) {
                return interaction.editReply(`original message not found.`);
            }

            const fileInfo = Array.from(targetMessage.attachments.values()).map(describeAttachment);

            const infraction = await createInfraction({
                guild_id: interaction.guildId,
                target_user_id: targetMessage.author.id,
                moderator_id: interaction.user.id,
                rule_id: ruleId,
                rule_text_snapshot: reason,
                action_type: 'lookup',
                message_link: targetMessage.url,
                message_content: targetMessage.content || null,
                evidence_urls: []
            });
            const caseTag = infraction ? ` (infraction #${infraction.case_number})` : '';

            const noticePromise = targetMessage.reply(`staff notice for <@${targetMessage.author.id}>${caseTag}:\n${reason}`);
            noticePromise.catch(() => null);
            const logPromise = sendLog(interaction.guild, {
                title: infraction ? `rule citation: infraction #${infraction.case_number}` : 'rule citation',
                kind: 'citation',
                color: COLORS.danger,
                fields: [
                    { name: 'moderator', value: who(interaction.user), inline: true },
                    { name: 'cited user', value: who(targetMessage.author), inline: true },
                    { name: 'channel', value: `<#${interaction.channelId}>`, inline: true },
                    { name: 'rule', value: ruleId === 'custom' ? 'custom' : `\`${ruleId}\``, inline: true },
                    { name: 'sent at', value: targetMessage.createdAt.toISOString(), inline: true },
                    { name: 'message id', value: targetMessage.id, inline: true },
                    { name: 'staff notice', value: ruleId === 'custom' ? clip(reason) : quotedRuleText(reason, 1000) },
                    { name: 'cited message', value: clip(targetMessage.content) || '*(no text)*' },
                    { name: 'files (not saved)', value: fileInfo.join('\n') },
                    { name: 'embeds / stickers', value: (targetMessage.embeds.length || targetMessage.stickers.size) ? `${targetMessage.embeds.length} embed(s), ${targetMessage.stickers.size} sticker(s)` : '' },
                    { name: 'was a reply to', value: targetMessage.reference?.messageId },
                    { name: 'jump', value: targetMessage.url }
                ]
            });
            const [, logged] = await Promise.all([noticePromise, logPromise]);
            if (!logged) {
                return interaction.editReply('could not write to the log channel, citation left in place and parent message not deleted.');
            }

            if (!(await getAutoPurge(interaction.guildId)).parent) {
                return interaction.editReply(`rule citation posted${caseTag}. the cited message was left in place (parent auto-purge is off).`);
            }
            await Promise.all([
                targetMessage.delete().catch(() => null),
                interaction.editReply(`rule citation posted${caseTag} & parent message deleted.`)
            ]);
            return;
        }
    } catch (error) {
        console.error(error);
        return interaction.editReply(`skill issue: ${error.message}`);
    }
}

async function collectRecentMessages(channel, beforeId, count, userIds = []) {
    const out = [];
    let before = beforeId;
    let scanned = 0;
    const scanLimit = userIds.length ? 3000 : count;
    while (out.length < count && scanned < scanLimit) {
        const batch = await channel.messages.fetch({ limit: 100, before });
        if (batch.size === 0) break;
        scanned += batch.size;
        for (const m of batch.values()) {
            if (out.length < count && (!userIds.length || userIds.includes(m.author.id))) out.push(m);
        }
        before = batch.last().id;
    }
    return out;
}

async function runCountPurge(interaction, { count, users = [], beforeId, extraMessages = [] }) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ManageMessages)) {
        return interaction.editReply('okite is missing **Manage Messages** in this channel, cannot purge.');
    }
    try {
        const collected = await collectRecentMessages(interaction.channel, beforeId, count, users.map(u => u.id));
        if (collected.length === 0) return interaction.editReply('no matching messages found.');
        const toDelete = [...collected, ...extraMessages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        return await executePurge(interaction, toDelete, {
            label: 'purge count',
            detailFields: [{ name: 'mode', value: `last ${count}${users.length ? ` from ${users.map(u => u.username).join(', ')}` : ''}`, inline: true }]
        });
    } catch (error) {
        console.error(error);
        return interaction.editReply(`failed to purge messages: ${error.message}`);
    }
}

function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
    }
    return d[a.length][b.length];
}

// command words only; args untouched
function fuzzyMatch(input, words) {
    const x = String(input ?? '').toLowerCase();
    if (!/^[a-z0-9_-]{2,}$/.test(x)) return null;
    if (Object.hasOwn(words, x)) return { match: words[x], exact: true };

    const limit = x.length <= 5 ? 1 : 2;
    const scored = new Map();
    for (const [word, canonical] of Object.entries(words)) {
        if (word !== canonical) continue;
        let d = editDistance(x, word);
        if (x.length >= 3 && word.startsWith(x)) d = Math.min(d, 0.5);
        if (d <= limit) scored.set(canonical, Math.min(scored.get(canonical) ?? Infinity, d));
    }
    if (!scored.size) return null;
    const best = Math.min(...scored.values());
    const winners = [...scored].filter(([, d]) => d === best).map(([c]) => c);
    return winners.length === 1 ? { match: winners[0] } : { ambiguous: winners };
}

const COMMAND_WORDS = {
    help: 'help', ping: 'ping', cite: 'cite', lookup: 'cite', purge: 'purge', ban: 'ban', lock: 'lock', unlock: 'unlock',
    kick: 'kick', softban: 'softban', mute: 'mute', m: 'mute', timeout: 'mute', unmute: 'unmute', untimeout: 'unmute',
    setlog: 'setlog', logchannels: 'logchannels', prefix: 'prefix', autopurge: 'autopurge', autocorrect: 'autocorrect', requirerule: 'requirerule', messagelogs: 'messagelogs', timezone: 'timezone', tz: 'timezone',
    rule: 'rule', rules: 'rule', infraction: 'infraction', infractions: 'infraction', inf: 'infraction', history: 'history',
    alias: 'alias', aliases: 'alias'
};
const INFRACTION_SUBS = { view: 'view', show: 'view', user: 'user', history: 'user', list: 'user', moderator: 'moderator', mod: 'moderator', recent: 'recent', latest: 'recent', add: 'add', new: 'add', edit: 'edit', void: 'void', delete: 'delete', del: 'delete', remove: 'delete', rm: 'delete', restore: 'restore', unvoid: 'restore' };
const ALIAS_SUBS = { add: 'add', new: 'add', create: 'add', remove: 'remove', rm: 'remove', delete: 'remove', del: 'remove', list: 'list', ls: 'list' };
const RULE_SUBS = { add: 'add', remove: 'remove', rm: 'remove', delete: 'remove', list: 'list', ls: 'list' };
const PREFIX_SUBS = { show: 'show', set: 'set', reset: 'reset', default: 'reset' };
const ON_OFF = { on: 'on', enable: 'on', true: 'on', yes: 'on', off: 'off', disable: 'off', false: 'off', no: 'off' };
const AUTOPURGE_TARGETS = { commands: 'commands', command: 'commands', parent: 'parent', parents: 'parent' };
const LOG_WORDS = { general: 'general', citation: 'citation', citations: 'citation', purge: 'purge', purges: 'purge', moderation: 'moderation', messages: 'messages', members: 'members', voice: 'voice', server: 'server' };

const defaultPrefix = () => config.prefix || process.env.PREFIX || '!';
const prefixCache = new Map();

const HELP_GROUPS = [
    ['moderation', ['ban', 'kick', 'softban', 'mute', 'unmute', 'purge', 'cite', 'lock', 'unlock']],
    ['infractions', ['infraction', 'alias']],
    ['server', ['setlog', 'logchannels', 'prefix', 'autopurge', 'autocorrect', 'requirerule', 'messagelogs', 'timezone', 'rule']],
    ['utility', ['ping', 'help']]
];
const COMMAND_HELP = require('./help');

const ruleLabel = (id, title) => {
    const m = String(id).match(/^r(\d+)(?:_(\d+))?$/i);
    return m ? `**Rule ${m[1]}${m[2] !== undefined ? `.${m[2]}` : ''}** / ${title} \`${id}\`` : `**${id}** / ${title}`;
};
const guildLook = async (guild) => ({ name: guild?.name, icon: guild?.iconURL?.({ extension: 'png', size: 256 }), prefix: guild?.id ? await getPrefix(guild.id) : undefined });
const RULES_PAGE_BUDGET = 3200;
const RULES_PER_PAGE = 12;
const ruleBody = (text) => listify(plainRuleText(text)).split('\n').filter((line, i) => !(i === 0 && /^\*\*rule\b/i.test(line.trim()))).join('\n').trim();

function renderRuleList(serverRules, page = 0, { name: serverName = '', icon: serverIcon, prefix = defaultPrefix() } = {}) {
    if (!serverRules.length) return { content: 'no rules set. add one with /rule add.' };
    if (!USE_CONTAINERS) return { content: `**configured rules:**\n${serverRules.map(r => `- **${r.id}** (${r.label}): ${r.desc}`).join('\n')}` };
    const entry = (r) => {
        const body = ruleBody(r.text) || r.desc || '';
        return `${ruleLabel(r.id, plainText(stripRulePrefix(r.label) || r.label))}${body ? `\n${clip(body, 3000).split('\n').map(l => (l ? `> ${l}` : '>')).join('\n')}` : ''}`;
    };
    const idOf = (id) => String(id).match(/^r(\d+)(?:_(\d+))?$/i);
    const units = [];
    const byTop = new Map();
    for (const r of serverRules) {
        const m = idOf(r.id);
        if (!m) { units.push({ rules: [], plain: [r] }); continue; }
        const top = Number(m[1]);
        if (!byTop.has(top)) { const unit = { top, head: null, subs: [], group: null, plain: null, rules: [] }; byTop.set(top, unit); units.push(unit); }
        const unit = byTop.get(top);
        if (m[2] === undefined) unit.head = r; else unit.subs.push({ r, n: Number(m[2]) });
        unit.group = unit.group || r.group || null;
        unit.rules.push(r);
    }
    for (const u of units) {
        if (u.plain) { u.items = u.plain.map(entry); u.size = u.items.reduce((n, x) => n + x.length + 1, 0); u.count = 1; continue; }
        u.subs.sort((x, y) => x.n - y.n);
        const heading = u.head
            ? `### Rule ${u.top} / ${plainText(stripRulePrefix(u.head.label) || u.head.label)} \`r${u.top}\``
            : (u.subs.length > 1 ? `### Rule ${u.top}${u.group ? ` / ${plainText(u.group)}` : ''} \`r${u.top}\`` : null);
        const headBody = u.head ? (ruleBody(u.head.text) || u.head.desc || '') : '';
        u.items = [
            ...(heading ? [heading] : []),
            ...(headBody ? [clip(headBody, 3000).split('\n').map(l => (l ? `> ${l}` : '>')).join('\n')] : []),
            ...u.subs.map(x => entry(x.r))
        ];
        u.size = u.items.reduce((n, x) => n + x.length + 1, 0);
        u.count = u.rules.length;
    }
    const pages = [];
    let current = [];
    let size = 0;
    for (const u of units) {
        if (current.length && (current.reduce((n, x) => n + x.count, 0) + u.count > RULES_PER_PAGE || size + u.size > RULES_PAGE_BUDGET)) { pages.push(current); current = []; size = 0; }
        current.push(u);
        size += u.size;
    }
    if (current.length) pages.push(current);
    const at = Math.min(Math.max(page, 0), pages.length - 1);
    const container = containerHeader(new ContainerBuilder().setAccentColor(COLORS.info), [`## ${serverName ? `${plainText(serverName)} Rules` : 'Rules'}`, `-# ${serverRules.length} ${serverRules.length === 1 ? 'rule' : 'rules'}`,
        `-# type \`${prefix}rule list\` or use \`/rule list\` to list rules.`, `-# add / remove rules with \`/rule add\`, \`${prefix}rule remove <id>\` or \`/rule remove\`.`].join('\n'), serverIcon || okiteIcon());
    container.addSeparatorComponents(divider());
    pages[at].forEach((u, i) => {
        if (i > 0) container.addSeparatorComponents(divider());
        u.items.forEach(text => container.addTextDisplayComponents(textBlock(text)));
    });
    const components = [container];
    if (pages.length > 1) {
        container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`-# page ${at + 1}/${pages.length}`));
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rulepage:${at - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(at === 0),
            new ButtonBuilder().setCustomId(`rulepage:${at + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(at >= pages.length - 1)
        ));
    }
    return { flags: V2_FLAG, components };
}

function renderHelp(prefix, wanted) {
    return USE_CONTAINERS ? renderHelpContainer(prefix, wanted) : renderHelpEmbed(prefix, wanted);
}

function renderHelpContainer(prefix, wanted) {
    const word = String(wanted || '').trim().toLowerCase().replace(/^[!?./]/, '');
    const name = COMMAND_HELP[word] ? word : COMMAND_WORDS[word];
    const container = new ContainerBuilder().setAccentColor(COLORS.brand);
    const quote = (lines) => lines.map(l => `> ${l}`).join('\n');
    if (name && COMMAND_HELP[name]) {
        const h = COMMAND_HELP[name];
        const [label, ...details] = h.desc.split('\n');
        containerHeader(container, [`## ${prefix}${name}`, label, quote(details)].join('\n'), okiteIcon());
        const syntax = `${prefix}${h.syntax.replace(/\n/g, `\n${prefix}`)}`;
        container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`**Syntax**\n${codeBlock(syntax)}\n> **needs:** ${h.perm}`));
        container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock('-# <> required, [] optional'));
        return { flags: V2_FLAG, components: [container] };
    }
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${BANNER_NAME}`)));
    containerHeader(container, `## available commands\n> use \`${prefix}help <command>\` for details. every command also works as a slash command.`, okiteIcon());
    const body = HELP_GROUPS.map(([group, names]) => `**${group}**\n${names.map(n => `\`${n}\``).join(' ')}`).join('\n\n');
    container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(body));
    if (word) container.addSeparatorComponents(divider()).addTextDisplayComponents(textBlock(`-# no command called "${word.slice(0, 30)}"`));
    return { flags: V2_FLAG, components: [container], files: [bannerFile()] };
}

function renderHelpEmbed(prefix, wanted) {
    const word = String(wanted || '').trim().toLowerCase().replace(/^[!?./]/, '');
    const name = COMMAND_HELP[word] ? word : COMMAND_WORDS[word];
    const embed = new EmbedBuilder().setColor(COLORS.brand);
    if (name && COMMAND_HELP[name]) {
        const h = COMMAND_HELP[name];
        const [label, ...details] = h.desc.split('\n');
        const lines = [[label, ...details.map(l => `> ${l}`)].join('\n'), '', `**Syntax**\n\`\`\`\n${prefix}${h.syntax.replace(/\n/g, `\n${prefix}`)}\n\`\`\``, `> **needs:** ${h.perm}`];
        return { embeds: [embed.setTitle(`${prefix}${name}`).setDescription(lines.join('\n')).setFooter({ text: '<> required, [] optional' })] };
    }
    const body = HELP_GROUPS.map(([group, names]) => `**${group}**\n${names.map(n => `\`${n}\``).join(' ')}`).join('\n\n');
    embed.setTitle('available commands').setDescription(`> use \`${prefix}help <command>\` for details. every command also works as a slash command.\n\n${body}`);
    if (word) embed.setFooter({ text: `no command called "${word.slice(0, 30)}"` });
    return { embeds: [embed] };
}

const autoPurgeCache = new Map();

async function getAutoPurge(guildId) {
    if (autoPurgeCache.has(guildId)) return autoPurgeCache.get(guildId);
    let settings = { commands: !!config.autoPurge, parent: config.autoPurgeParent !== false, correct: !!config.autoCorrect, requireRule: !!config.requireRule, messageLogs: !!config.messageLogs, timezone: config.timezone || null };
    if (process.env.MONGODB_URI) {
        const doc = await Guild.findOne({ guildId }).lean().catch(() => null);
        if (doc) settings = { commands: !!doc.autoPurge, parent: doc.autoPurgeParent !== false, correct: !!doc.autoCorrect, requireRule: !!doc.requireRule, messageLogs: !!doc.messageLogs, timezone: doc.timezone || null };
    }
    autoPurgeCache.set(guildId, settings);
    return settings;
}

async function setAutoPurge(guildId, target, enabled) {
    const key = target === 'parent' ? 'autoPurgeParent' : target === 'correct' ? 'autoCorrect' : target === 'rule' ? 'requireRule' : target === 'messagelogs' ? 'messageLogs' : target === 'timezone' ? 'timezone' : 'autoPurge';
    if (process.env.MONGODB_URI) {
        await Guild.findOneAndUpdate({ guildId }, { [key]: enabled }, { upsert: true, new: true });
    } else {
        config[key] = enabled;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
    }
    autoPurgeCache.delete(guildId);
    if (!process.env.MONGODB_URI) autoPurgeCache.clear();
}

const messageLogsOn = async (guildId) => (await getAutoPurge(guildId)).messageLogs;

async function getPrefix(guildId) {
    if (prefixCache.has(guildId)) return prefixCache.get(guildId);
    let prefix = defaultPrefix();
    if (process.env.MONGODB_URI) {
        const guildConfig = await Guild.findOne({ guildId }).catch(() => null);
        if (guildConfig?.prefix) prefix = guildConfig.prefix;
    }
    prefixCache.set(guildId, prefix);
    return prefix;
}

async function setPrefix(guildId, prefix) {
    if (process.env.MONGODB_URI) {
        await Guild.findOneAndUpdate({ guildId }, { prefix: prefix ?? null }, { upsert: true, new: true });
    } else {
        config.prefix = prefix ?? undefined;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        prefixCache.clear();
        return;
    }
    prefixCache.set(guildId, prefix ?? defaultPrefix());
}

const MAX_ALIASES = 50;
const aliasCache = new Map();

async function getAliases(guildId) {
    if (aliasCache.has(guildId)) return aliasCache.get(guildId);
    let list = Object.entries(config.aliases || {}).map(([name, command]) => ({ name, command }));
    if (process.env.MONGODB_URI) {
        const doc = await Guild.findOne({ guildId }).lean().catch(() => null);
        if (doc) list = doc.aliases || [];
    }
    const map = new Map(list.map(a => [a.name, a.command]));
    aliasCache.set(guildId, map);
    return map;
}

async function saveAliases(guildId, map) {
    if (process.env.MONGODB_URI) {
        await Guild.findOneAndUpdate({ guildId }, { aliases: [...map].map(([name, command]) => ({ name, command })) }, { upsert: true, new: true });
        aliasCache.set(guildId, new Map(map));
    } else {
        config.aliases = Object.fromEntries(map);
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        aliasCache.clear();
    }
}

function expandAlias(rawTemplate, argText) {
    const taken = new Set([...rawTemplate.matchAll(/\$([1-9])/g)].map(m => Number(m[1])));
    let slot = 0;
    const template = rawTemplate.replace(/<([a-z][\w .-]*?)(\.\.\.)?>/gi, (_, __, rest) => {
        if (rest) return '$*';
        do slot++; while (taken.has(slot));
        return `$${slot}`;
    });
    const args = argText.trim() ? argText.trim().split(/\s+/) : [];
    const used = [...template.matchAll(/\$([1-9])/g)].map(m => Number(m[1]));
    const remainder = restAfter(argText, used.length ? Math.max(...used) : 0);
    const placed = template.replace(/\$([1-9])/g, (_, n) => args[Number(n) - 1] ?? '');
    return (placed.includes('$*') ? placed.split('$*').join(remainder) : `${placed} ${remainder}`).trim();
}

function aliasSlotNotes(template) {
    const taken = new Set([...template.matchAll(/\$([1-9])/g)].map(m => Number(m[1])));
    let slot = 0;
    const notes = [];
    for (const m of template.matchAll(/\$([1-9])|\$\*|<([a-z][\w .-]*?)(\.\.\.)?>/gi)) {
        if (m[1]) notes.push(`\`${m[0]}\` = word ${m[1]}`);
        else if (m[0] === '$*' || m[3]) notes.push(`\`${m[0]}\` = all the words`);
        else { do slot++; while (taken.has(slot)); notes.push(`\`${m[0]}\` = word ${slot}`); }
    }
    const used = new Set([...taken, ...Array.from({ length: slot }, (_, i) => i + 1)]);
    const top = Math.max(0, ...used);
    const skipped = Array.from({ length: top }, (_, i) => i + 1).filter(n => !used.has(n));
    const warning = skipped.length && !template.includes('$*') && !/\.\.\.>/.test(template)
        ? ` heads up: word ${skipped.join(', ')} is not used, so it is dropped.`
        : '';
    return notes.length
        ? `the words you type after it fill the command: ${notes.join(', ')}. any words left over are added at the end.${warning}`
        : 'the words you type after it are added to the end of the command.';
}

function checkAlias(name, command, existing) {
    if (!/^[a-z0-9_-]{1,20}$/.test(name)) return 'an alias name is 1 to 20 lowercase letters, numbers, `-` or `_`.';
    if (COMMAND_WORDS[name]) return `\`${name}\` is already a command, so it can't be an alias.`;
    if (!existing.has(name) && existing.size >= MAX_ALIASES) return `a server can have at most ${MAX_ALIASES} aliases.`;
    const first = command.trim().split(/\s+/)[0]?.toLowerCase();
    if (!first || !COMMAND_WORDS[first]) return `the command has to start with one of okite's commands (for example \`infraction add\`), not \`${first || ''}\`.`;
    if (COMMAND_WORDS[first] === 'alias') return 'an alias can\'t run the alias command.';
    if (command.length > 200) return 'that command is too long (200 characters at most).';
    return null;
}

const restAfter = (text, count) => {
    let rest = text.trim();
    for (let i = 0; i < count; i++) rest = rest.replace(/^\S+\s*/, '');
    return rest;
};

async function resolvePrefixUser(token) {
    const id = token?.match(/^<@!?(\d+)>$/)?.[1] || (/^\d{17,20}$/.test(token || '') ? token : null);
    return id ? client.users.fetch(id).catch(() => null) : null;
}

function resolvePrefixChannel(guild, token) {
    const id = token?.match(/^<#(\d+)>$/)?.[1] || (/^\d{17,20}$/.test(token || '') ? token : null);
    return id ? guild.channels.cache.get(id) ?? null : null;
}

async function getReplyMessage(message) {
    if (!message.reference?.messageId) return null;
    const target = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    return target && !target.author.bot ? target : null;
}

async function getReplyAuthor(message) {
    return (await getReplyMessage(message))?.author ?? null;
}

async function parsePrefixCommand(message, name, argText, PREFIX, fuzzy = false) {
    const args = argText.trim() ? argText.trim().split(/\s+/) : [];
    const values = {};
    let subcommand = null;
    const fail = (error) => ({ error });

    const sub = (word, map) => {
        if (word === undefined) return { value: undefined };
        const hit = fuzzyMatch(word, map);
        if (!hit) return { value: word };
        if (hit.exact) return { value: hit.match };
        if (!fuzzy) return { value: word };
        if (hit.ambiguous) return { error: `did you mean ${hit.ambiguous.map(w => `\`${w}\``).join(' or ')}?` };
        (message.__corrections ||= []).push([word, hit.match]);
        return { value: hit.match };
    };

    const replyUser = await getReplyAuthor(message);
    const takeUser = async (i) => {
        const user = await resolvePrefixUser(args[i]);
        return user ? { user, used: 1 } : { user: replyUser, used: 0 };
    };

    if (['ban', 'kick', 'softban', 'mute', 'unmute'].includes(name)) {
        const { user, used } = await takeUser(0);
        const durationAllowed = name === 'ban' || name === 'mute';
        if (!user) return fail(`syntax: \`${PREFIX}${name} <user>${durationAllowed ? ' [duration]' : ''}${name === 'ban' ? ' [--urgent]' : ''}${name === 'unmute' ? '' : ' [--rule <id>]'} [reason]\` (or reply to their message)`);
        values.user = user;
        let i = used;
        for (let n = 0; n < 4 && args[i]; n++) {
            const word = args[i].toLowerCase();
            if (name === 'ban' && ['--urgent', '-u', 'urgent'].includes(word)) { values.urgent = true; i++; continue; }
            if (word === '--rule' && args[i + 1]) { values.rule = args[i + 1]; i += 2; continue; }
            if (durationAllowed && !values.duration && parseDuration(args[i])) { values.duration = args[i]; i++; continue; }
            break;
        }
        values.urgent = values.urgent ?? false;
        values.reason = restAfter(argText, i) || null;
        return { commandName: name, subcommand, values };
    }

    if (name === 'lock' || name === 'unlock') {
        if (args[0]) {
            values.channel = resolvePrefixChannel(message.guild, args[0]);
            if (!values.channel) return fail(`syntax: \`${PREFIX}${name} [#channel]\``);
        }
        return { commandName: name, subcommand, values };
    }

    if (name === 'autocorrect') {
        const state = sub(args[0], { ...ON_OFF, show: 'show' });
        if (state.error) return fail(state.error);
        if (state.value === 'on' || state.value === 'off') values.enabled = state.value === 'on';
        else if (state.value !== undefined && state.value !== 'show') return fail(`syntax: \`${PREFIX}autocorrect\` to show, or \`${PREFIX}autocorrect on|off\``);
        return { commandName: 'autocorrect', subcommand, values };
    }

    if (name === 'timezone') {
        if (args.length) values.zone = args.join(' ');
        return { commandName: 'timezone', subcommand, values };
    }

    if (name === 'messagelogs') {
        const state = sub(args[0], { ...ON_OFF, show: 'show' });
        if (state.error) return fail(state.error);
        if (state.value === 'on' || state.value === 'off') values.enabled = state.value === 'on';
        else if (state.value !== undefined && state.value !== 'show') return fail(`syntax: \`${PREFIX}messagelogs\` to show, or \`${PREFIX}messagelogs on|off\``);
        return { commandName: 'messagelogs', subcommand, values };
    }

    if (name === 'requirerule') {
        const state = sub(args[0], { ...ON_OFF, show: 'show' });
        if (state.error) return fail(state.error);
        if (state.value === 'on' || state.value === 'off') values.enabled = state.value === 'on';
        else if (state.value !== undefined && state.value !== 'show') return fail(`syntax: \`${PREFIX}requirerule\` to show, or \`${PREFIX}requirerule on|off\``);
        return { commandName: 'requirerule', subcommand, values };
    }

    if (name === 'autopurge') {
        subcommand = null;
        if (!args[0]) return { commandName: 'autopurge', subcommand, values };
        const target = sub(args[0], AUTOPURGE_TARGETS);
        const state = sub(args[1], ON_OFF);
        if (target.error || state.error) return fail(target.error || state.error);
        if (!['commands', 'parent'].includes(target.value?.toLowerCase()) || !['on', 'off'].includes(state.value || '')) {
            return fail(`syntax: \`${PREFIX}autopurge\` to show, or \`${PREFIX}autopurge commands|parent on|off\``);
        }
        values.target = target.value.toLowerCase();
        values.enabled = state.value === 'on';
        return { commandName: 'autopurge', subcommand, values };
    }

    if (name === 'ping') return { commandName: 'ping', subcommand, values };

    if (name === 'logchannels') return { commandName: 'logchannels', subcommand, values };

    if (name === 'prefix') {
        const picked = sub(args[0], PREFIX_SUBS);
        if (picked.error) return fail(picked.error);
        subcommand = picked.value?.toLowerCase() || 'show';
        if (subcommand === 'set') {
            values.prefix = args[1];
            if (!values.prefix) return fail(`syntax: \`${PREFIX}prefix set <prefix>\``);
        } else if (subcommand !== 'reset' && subcommand !== 'show') {
            return fail(`syntax: \`${PREFIX}prefix\`, \`${PREFIX}prefix set <prefix>\` or \`${PREFIX}prefix reset\``);
        }
        return { commandName: 'prefix', subcommand, values };
    }

    if (name === 'setlog' && sub(args[0], { reset: 'reset', clear: 'reset' }).value === 'reset') {
        const picked = sub(args[1], LOG_WORDS);
        if (picked.error) return fail(picked.error);
        const type = (picked.value || 'general').toLowerCase();
        if (!Object.keys(LOG_KINDS).includes(type)) return fail(`type must be one of: ${Object.keys(LOG_KINDS).join(', ')}.`);
        values.reset = true;
        values.type = type;
        return { commandName: 'setlog', subcommand, values };
    }

    if (name === 'setlog') {
        values.channel = resolvePrefixChannel(message.guild, args[0]);
        if (!values.channel) return fail(`syntax: \`${PREFIX}setlog <#channel> [${Object.keys(LOG_KINDS).join('|')}]\``);
        if (args[1]) {
            const picked = sub(args[1], LOG_WORDS);
            if (picked.error) return fail(picked.error);
            if (!Object.keys(LOG_KINDS).includes(picked.value.toLowerCase())) return fail(`type must be one of: ${Object.keys(LOG_KINDS).join(', ')}.`);
            values.type = picked.value.toLowerCase();
        }
        return { commandName: 'setlog', subcommand, values };
    }

    if (name === 'alias') {
        const picked = sub(args[0], ALIAS_SUBS);
        if (picked.error) return fail(picked.error);
        subcommand = picked.value?.toLowerCase() || 'list';
        if (subcommand === 'add') {
            values.name = args[1]?.toLowerCase();
            values.command = restAfter(argText, 2);
            if (!values.name || !values.command) return fail(`syntax: \`${PREFIX}alias add <name> <command...>\`, for example \`${PREFIX}alias add warn infraction add\``);
        } else if (subcommand === 'remove') {
            values.name = args[1]?.toLowerCase();
            if (!values.name) return fail(`syntax: \`${PREFIX}alias remove <name>\``);
        } else if (subcommand !== 'list') {
            return fail(`syntax: \`${PREFIX}alias list\`, \`${PREFIX}alias add <name> <command...>\` or \`${PREFIX}alias remove <name>\``);
        }
        return { commandName: 'alias', subcommand, values };
    }

    if (name === 'rule') {
        const picked = sub(args[0], RULE_SUBS);
        if (picked.error) return fail(picked.error);
        subcommand = picked.value?.toLowerCase();
        if (subcommand === 'remove') {
            values.id = args[1];
            if (!values.id) return fail(`syntax: \`${PREFIX}rule remove <id>\``);
        } else if (subcommand !== 'list' && subcommand !== 'add') {
            return fail(`syntax: \`${PREFIX}rule list\` or \`${PREFIX}rule remove <id>\``);
        }
        return { commandName: 'rule', subcommand, values };
    }

    if (name === 'infraction' || name === 'infractions' || name === 'inf') {
        const looksLikeUser = (t) => /^(<@!?\d+>|\d{17,20})$/.test(t || '');
        const first = sub(args[0], INFRACTION_SUBS);
        if (first.error) return fail(first.error);
        if (first.value !== undefined && !looksLikeUser(args[0])) args[0] = first.value;
        if (looksLikeUser(args[0])) args.unshift('user');
        else if (['history', 'list'].includes(args[0]?.toLowerCase())) args[0] = 'user';
        else if (args[0]?.toLowerCase() === 'view' && looksLikeUser(args[1])) args[0] = 'user';
        else if (!args[0] && replyUser) args.push('user');

        subcommand = args[0]?.toLowerCase();
        if (['view', 'edit', 'void', 'restore', 'delete'].includes(subcommand)) {
            values.id = Number.parseInt(args[1], 10);
            if (!Number.isInteger(values.id) || values.id < 1) return fail(`syntax: \`${PREFIX}infraction ${subcommand} <id>${subcommand === 'edit' || subcommand === 'void' ? ' <reason>' : ''}\`${subcommand === 'view' ? ` (for a user's history use \`${PREFIX}infraction user @user\`)` : ''}`);
            if (subcommand === 'edit' || subcommand === 'void') {
                values.reason = restAfter(argText, 2);
                if (!values.reason) return fail(`a reason is required: \`${PREFIX}infraction ${subcommand} ${values.id} <reason>\``);
            }
        } else if (subcommand === 'user' || subcommand === 'moderator') {
            const { user } = await takeUser(1);
            if (!user) return fail(`syntax: \`${PREFIX}infraction ${subcommand} <user>\` (or reply to their message)`);
            values.user = user;
        } else if (subcommand === 'add') {
            const { user, used } = await takeUser(1);
            values.user = user;
            let skip = 1 + used;
            const ruleIds = (await getServerRules(message.guildId)).map(r => r.id.toLowerCase());
            if (args[skip] === '--rule') { skip++; values.rule = args[skip]; skip++; }
            else if (args[skip] && (args[skip].toLowerCase() === 'custom' || ruleIds.includes(args[skip].toLowerCase()))) { values.rule = args[skip]; skip++; }
            else values.rule = null;
            if (parseDuration(args[skip])) { values.duration = args[skip]; skip++; }
            let reasonText = restAfter(argText, skip);
            if (!values.duration && reasonText) {
                const words = reasonText.split(/\s+/);
                if (parseDuration(words.at(-1))) { values.duration = words.pop(); reasonText = words.join(' '); }
            }
            values.reason = reasonText || null;
            if (!values.user) return fail(`syntax: \`${PREFIX}infraction add <user> [rule|custom] [duration] [reason]\` (no reason is recorded as "not specified", no duration as permanent)`);
            const parent = used === 0 ? await getReplyMessage(message) : null;
            if (parent && parent.author.id === values.user.id) values.parentMessage = parent;
        } else if (subcommand !== 'recent') {
            return fail(`syntax: \`${PREFIX}infraction view|user|moderator|recent|add|edit|void|restore\``);
        }
        return { commandName: 'infraction', subcommand, values };
    }

    return null;
}

function isReadOnlyCommand(commandName, subcommand, values = {}) {
    if (['ping', 'help', 'logchannels'].includes(commandName)) return true;
    if (commandName === 'infraction') return ['view', 'user', 'moderator', 'recent'].includes(subcommand);
    if (commandName === 'rule' || commandName === 'alias') return subcommand === 'list';
    if (commandName === 'prefix') return !subcommand || subcommand === 'show';
    if (commandName === 'autopurge' || commandName === 'autocorrect' || commandName === 'requirerule' || commandName === 'messagelogs') return values.enabled === undefined || values.enabled === null;
    if (commandName === 'timezone') return !values.zone;
    return false;
}

function createPrefixInteraction(message, commandName, subcommand, values) {
    let sent = null;

    const isContainerPayload = (p) => typeof p === 'object' && p !== null && (Number(p.flags ?? 0) & V2_FLAG) !== 0;
    const toPayload = (payload) => {
        const p = typeof payload === 'string' ? { content: payload } : { ...payload };
        delete p.ephemeral;
        if (isContainerPayload(p)) {
            p.flags = Number(p.flags) & ~MessageFlags.Ephemeral;
            if (message.__correctionNote) p.components = [textBlock(message.__correctionNote), ...(p.components || [])];
        } else if (message.__correctionNote) p.content = p.content ? `${message.__correctionNote}\n${p.content}` : message.__correctionNote;
        p.allowedMentions = { parse: [], repliedUser: false };
        return p;
    };
    let placeholder = null;
    let placeholderTimer = null;
    const send = async (payload) => {
        clearTimeout(placeholderTimer);
        if (placeholder) await placeholder;
        if (sent && (isContainerPayload(payload) || sent.flags?.has?.(V2_FLAG))) {
            await sent.delete().catch(() => null);
            sent = await message.reply(toPayload(payload));
        } else if (sent) {
            sent = await sent.edit({ content: null, embeds: [], components: [], ...toPayload(payload) });
        } else {
            sent = await message.reply(toPayload(payload));
        }
        return sent;
    };

    return {
        commandName,
        guild: message.guild,
        guildId: message.guildId,
        channel: message.channel,
        channelId: message.channelId,
        user: message.author,
        member: message.member,
        memberPermissions: message.member.permissions,
        replied: false,
        deferred: false,
        parentMessage: values.parentMessage ?? null,
        options: {
            getSubcommand: () => subcommand,
            getUser: (n) => values[n] ?? null,
            getString: (n) => values[n] ?? null,
            getInteger: (n) => values[n] ?? null,
            getBoolean: (n) => values[n] ?? null,
            getChannel: (n) => values[n] ?? null
        },
        isChatInputCommand: () => true,
        isMessageContextMenuCommand: () => false,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        isButton: () => false,
        async deferReply() {
            this.deferred = true;
            placeholderTimer = setTimeout(() => {
                placeholder = message.reply(toPayload('working…')).then(m => { sent = m; }).catch(() => null);
            }, 1200);
            placeholderTimer.unref();
        },
        async reply(payload) { this.replied = true; return send(payload); },
        async editReply(payload) { return send(payload); },
        async followUp(payload) { return send(payload); },
        async showModal() { return send('that one needs the slash command.'); },
        async cleanup() {
            clearTimeout(placeholderTimer);
            if (isReadOnlyCommand(commandName, subcommand, values)) return;
            if (!(await getAutoPurge(message.guildId).catch(() => ({ commands: false }))).commands) return;
            await Promise.all([sent?.delete().catch(() => null), message.delete().catch(() => null)]);
        }
    };
}

async function getServerRules(guildId) {
    if (process.env.MONGODB_URI) {
        const guildConfig = await Guild.findOne({ guildId });
        if (guildConfig && guildConfig.rules.length > 0) return guildConfig.rules;
    }
    return rules;
}

async function handlePrefixMessage(message) {
    try {
        await runPrefixMessage(message);
    } catch (err) {
        console.error('prefix command error:', err);
        const perms = message.member?.permissions;
        const staff = perms && (perms.has(PermissionFlagsBits.ManageMessages) || perms.has(PermissionFlagsBits.ManageChannels)
            || perms.has(PermissionFlagsBits.BanMembers) || perms.has(PermissionFlagsBits.KickMembers)
            || perms.has(PermissionFlagsBits.ModerateMembers) || perms.has(PermissionFlagsBits.Administrator));
        const prefix = prefixCache.get(message.guildId) ?? defaultPrefix();
        if (staff && message.content?.startsWith(prefix)) {
            message.reply({
                content: `that command hit an error (${clip(String(err.message || err), 150)}), so it may not have finished. check the log channel before running it again.`,
                allowedMentions: { parse: [], repliedUser: false }
            }).catch(() => null);
        }
    }
}

async function runPrefixMessage(message) {
    if (!message.guild || message.author.bot) return;
    const PREFIX = await getPrefix(message.guildId);
    if (!message.content.startsWith(PREFIX)) return;
    if (!message.member) message.member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!message.member) return;

    let [rawName, ...rest] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    let name = rawName?.toLowerCase();
    if (!name) return;
    let argText = message.content.slice(PREFIX.length).trim().slice(rawName.length).trim();
    const reply = (text) => message.reply({ content: text, allowedMentions: { parse: [], repliedUser: false } }).catch(() => null);

    const perms = message.member.permissions;
    const isMod = perms.has(PermissionFlagsBits.ManageMessages) || perms.has(PermissionFlagsBits.Administrator);

    const hasAnyStaffPerm = isMod || perms.has(PermissionFlagsBits.ManageChannels) || perms.has(PermissionFlagsBits.BanMembers)
        || perms.has(PermissionFlagsBits.KickMembers) || perms.has(PermissionFlagsBits.ModerateMembers);
    if (!hasAnyStaffPerm) return;

    const settings = await getAutoPurge(message.guildId);
    const corrections = [];
    const aliases = await getAliases(message.guildId);
    let command = COMMAND_WORDS[name];
    const expand = (aliasName) => {
        const expanded = expandAlias(aliases.get(aliasName), argText);
        const [first, ...tail] = expanded.split(/\s+/);
        name = first.toLowerCase();
        rest = tail;
        argText = expanded.slice(first.length).trim();
        command = COMMAND_WORDS[name];
    };
    if (!command && aliases.has(name)) {
        expand(name);
    } else if (!command && settings.correct) {
        const words = aliases.size ? { ...COMMAND_WORDS, ...Object.fromEntries([...aliases.keys()].map(n => [n, n])) } : COMMAND_WORDS;
        const hit = fuzzyMatch(name, words);
        if (hit?.ambiguous) return reply(`did you mean ${hit.ambiguous.map(c => `\`${PREFIX}${c === 'history' ? 'infraction' : c}\``).join(' or ')}?`);
        if (hit?.match && aliases.has(hit.match)) { corrections.push([`${PREFIX}${name}`, `${PREFIX}${hit.match}`]); expand(hit.match); }
        else if (hit?.match) { command = hit.match; corrections.push([`${PREFIX}${name}`, `${PREFIX}${command}`]); }
    }
    if (!command) return;
    if (command === 'history') { command = 'infraction'; argText = `user ${argText}`.trim(); }
    message.__corrections = corrections;
    const noteFor = (fixes) => `*corrected ${fixes.map(([from, to]) => `\`${from}\` → \`${to}\``).join(', ')}*`;
    if (corrections.length) message.__correctionNote = noteFor(corrections);

    if (command === 'help') {
        if (!isMod) return;
        return message.reply({ ...renderHelp(PREFIX, rest[0]), allowedMentions: { parse: [], repliedUser: false } }).catch(() => null);
    }

    if (command === 'cite') {
        if (!isMod) return;
        if (!message.reference?.messageId) return reply(`reply to the message you want to cite: \`${PREFIX}cite <rule id>\` or \`${PREFIX}cite custom <reason>\``);

        const target = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        if (!target) return reply('couldn\'t find the message you replied to.');
        if (target.author.bot) return reply('can\'t cite a bot\'s message.');

        const first = rest[0];
        if (!first) return reply(`syntax: \`${PREFIX}cite <rule id>\` or \`${PREFIX}cite custom <reason>\``);

        let text, ruleId;
        if (first.toLowerCase() === 'custom') {
            text = restAfter(argText, 1);
            ruleId = 'custom';
            if (!text) return reply(`syntax: \`${PREFIX}cite custom <reason>\``);
        } else {
            const rule = (await getServerRules(message.guildId)).find(r => r.id.toLowerCase() === first.toLowerCase());
            if (!rule) return reply(`rule \`${first}\` not found. try \`/rule list\`.`);
            text = rule.text;
            ruleId = rule.id;
        }

        const interaction = createPrefixInteraction(message, 'lookup', null, {});
        await handleModerationAction(interaction, 'lookup', target.author.id, target.id, text, ruleId);
        message.delete().catch(() => null);
        await interaction.cleanup();
        return;
    }

    if (command === 'purge') {
        if (!isMod) return;

        const count = Number.parseInt(rest[0], 10);
        if (Number.isInteger(count)) {
            if (count < 1 || count > 1000) return reply('pick a count between 1 and 1000.');
            const filterUsers = [];
            for (const token of rest.slice(1, 11)) {
                const u = await resolvePrefixUser(token);
                if (!u) return reply(`syntax: \`${PREFIX}purge <count> [user ...]\` (up to 10 users, mentions or ids)`);
                if (!filterUsers.some(f => f.id === u.id)) filterUsers.push(u);
            }

            const interaction = createPrefixInteraction(message, 'purge', null, {});
            await runCountPurge(interaction, { count, users: filterUsers, beforeId: message.id, extraMessages: [message] });
            return interaction.cleanup();
        }

        if (!message.reference?.messageId) {
            return reply(`\`${PREFIX}purge <count> [user ...]\` deletes the latest messages, or reply to the first message you want gone with \`${PREFIX}purge\` to delete from it through your command.`);
        }
        markedpurgestarts.set(message.author.id, { channelId: message.channelId, messageId: message.reference.messageId });
        const interaction = createPrefixInteraction(message, 'mark / purge range', null, {});
        interaction.isChatInputCommand = () => false;
        interaction.isMessageContextMenuCommand = () => true;
        interaction.targetMessage = message;
        await handleInteraction(interaction);
        return interaction.cleanup();
    }

    const parsed = await parsePrefixCommand(message, command, argText, PREFIX, settings.correct);
    if (!parsed) return;
    if (parsed.error) return reply(parsed.error);

    const fixes = (message.__corrections || []).filter((f, i, all) => all.findIndex(g => g[0] === f[0] && g[1] === f[1]) === i);
    if (fixes.length) message.__correctionNote = noteFor(fixes);

    const interaction = createPrefixInteraction(message, parsed.commandName, parsed.subcommand, parsed.values);
    await handleInteraction(interaction);
    await interaction.cleanup();
}

const CATCHUP_ENABLED = process.env.CATCHUP !== 'off';
const CATCHUP_MIN_GAP_MS = (Number(process.env.CATCHUP_MIN_GAP_SECONDS) || 30) * 1000;
const CATCHUP_MAX_REQUESTS = Number(process.env.CATCHUP_MAX_REQUESTS) || 300;
const CATCHUP_MESSAGE_WINDOW_MS = 24 * 3600e3;

function diffSnapshots(prev, cur) {
    const byId = (list) => new Map((list || []).map(x => [x.id, x]));
    const [pc, cc, pr, cr] = [byId(prev.channels), byId(cur.channels), byId(prev.roles), byId(cur.roles)];
    const renamed = (before, now) => [...now.values()].filter(x => before.has(x.id) && before.get(x.id).name !== x.name).map(x => ({ id: x.id, from: before.get(x.id).name, to: x.name }));
    return {
        channelsCreated: [...cc.values()].filter(c => !pc.has(c.id)),
        channelsDeleted: [...pc.values()].filter(c => !cc.has(c.id)),
        channelsRenamed: renamed(pc, cc),
        rolesCreated: [...cr.values()].filter(r => !pr.has(r.id)),
        rolesDeleted: [...pr.values()].filter(r => !cr.has(r.id)),
        rolesRenamed: renamed(pr, cr),
        memberCount: prev.memberCount != null && cur.memberCount != null && prev.memberCount !== cur.memberCount ? { from: prev.memberCount, to: cur.memberCount } : null
    };
}

async function fetchAuditSince(guild, since, budget) {
    const out = [];
    let before;
    while (budget.left > 0 && out.length < 500) {
        budget.left--;
        let logs;
        try { logs = await guild.fetchAuditLogs({ limit: 100, before }); }
        catch (err) { return { entries: out, error: err.message }; }
        const list = [...logs.entries.values()];
        if (!list.length) break;
        out.push(...list.filter(e => e.createdTimestamp > since));
        const oldest = list.at(-1);
        if (oldest.createdTimestamp <= since || list.length < 100) break;
        before = oldest.id;
    }
    return { entries: out };
}

function describeAuditEntry(entry) {
    const at = `<t:${Math.floor(entry.createdTimestamp / 1000)}:f>`;
    const exec = entry.executor ? who(entry.executor) : 'unknown';
    const user = entry.target?.id ? who(entry.target) : `<@${entry.targetId}>`;
    const base = { entry, kind: 'moderation' };
    switch (entry.action) {
        case AuditLogEvent.MemberBanAdd:
            return { ...base, title: 'member banned', color: COLORS.danger, ban: true, fields: [{ name: 'user', value: user, inline: true }, { name: 'moderator', value: exec, inline: true }, { name: 'when', value: at, inline: true }, { name: 'reason', value: entry.reason }] };
        case AuditLogEvent.MemberBanRemove:
            return { ...base, title: 'member unbanned', color: COLORS.good, fields: [{ name: 'user', value: user, inline: true }, { name: 'moderator', value: exec, inline: true }, { name: 'when', value: at, inline: true }] };
        case AuditLogEvent.MemberKick:
            return { ...base, title: 'member kicked', color: COLORS.danger, fields: [{ name: 'user', value: user, inline: true }, { name: 'moderator', value: exec, inline: true }, { name: 'when', value: at, inline: true }, { name: 'reason', value: entry.reason }] };
        case AuditLogEvent.MemberUpdate: {
            const change = entry.changes?.find(c => c.key === 'communication_disabled_until');
            const nick = entry.changes?.find(c => c.key === 'nick');
            const mod = entry.executor && entry.executor.id !== entry.targetId ? [{ name: 'moderator', value: exec, inline: true }] : [];
            if (nick && !change) return { ...base, kind: 'members', title: 'member updated: display-name', color: COLORS.action, fields: [{ name: 'user', value: user, inline: true }, ...mod, { name: 'when', value: at, inline: true }, { name: 'display-name', value: `${nick.old ?? '*(none)*'} → ${nick.new ?? '*(none)*'}` }] };
            if (!change) return null;
            return { ...base, title: change.new ? 'member timed out' : 'timeout removed', color: change.new ? COLORS.danger : COLORS.good, fields: [{ name: 'user', value: user, inline: true }, { name: 'moderator', value: exec, inline: true }, { name: 'when', value: at, inline: true }, { name: 'until', value: change.new ? String(change.new) : '' }, { name: 'reason', value: entry.reason }] };
        }
        case AuditLogEvent.MemberRoleUpdate: {
            const names = (key) => [...new Set((entry.group || [entry]).flatMap(e => (e.changes?.find(c => c.key === key)?.new || []).map(r => r.name)))].join(', ');
            return { ...base, kind: 'members', title: 'member updated: roles', color: COLORS.action, fields: [{ name: 'user', value: user, inline: true }, { name: 'moderator', value: exec, inline: true }, { name: 'when', value: at, inline: true }, { name: 'role(s) added', value: names('$add') }, { name: 'role(s) removed', value: names('$remove') }] };
        }
        default:
            return null;
    }
}

const logOffline = (guild, payload) => sendLog(guild, { ...payload, title: `${payload.title} (while offline)` });

async function recordOfflineBan(guild, entry) {
    if (!supabase || !entry.target?.id) return false;
    const around = 5 * 60 * 1000;
    const { data } = await supabase.from('infractions').select('id, created_at').eq('guild_id', guild.id).eq('target_user_id', entry.target.id).eq('action_type', 'ban').limit(20);
    if ((data || []).some(r => Math.abs(new Date(r.created_at).getTime() - entry.createdTimestamp) < around)) return false;
    const moderatorId = entry.executor?.id || client.user.id;
    const infraction = await createInfraction({ guild_id: guild.id, target_user_id: entry.target.id, moderator_id: moderatorId, rule_id: null, rule_text_snapshot: entry.reason || 'banned (no reason given)', action_type: 'ban' });
    if (infraction) runBanSnapshot({ guild, target: entry.target, infraction, moderatorId, deleteAfter: false }).catch(err => console.error('offline ban snapshot error:', err));
    return !!infraction;
}

async function loadRecentCacheRows(guildId) {
    if (!supabase) return [];
    const rows = new Map();
    let cursor = new Date(Date.now() - CATCHUP_MESSAGE_WINDOW_MS).toISOString();
    for (let page = 0; page < 30; page++) {
        const { data, error } = await supabase.from('message_cache').select('*').eq('guild_id', guildId).gt('created_at', cursor).order('created_at', { ascending: true }).limit(1000);
        if (error || !data?.length) break;
        data.forEach(r => rows.set(r.message_id, r));
        if (data.length < 1000) break;
        cursor = data.at(-1).created_at;
    }
    return [...rows.values()];
}

async function fetchChannelHistory(channel, oldestMs, budget, maxPages = 10) {
    const messages = [];
    let before;
    let reachedOldest = false;
    for (let page = 0; page < maxPages && budget.left > 0; page++) {
        budget.left--;
        let batch;
        try { batch = await channel.messages.fetch({ limit: 100, before }); }
        catch { return { messages: [], reachedOldest: false, failed: true }; }
        if (!batch.size) { reachedOldest = true; break; }
        messages.push(...batch.values());
        const last = batch.last();
        before = last.id;
        if (last.createdTimestamp <= oldestMs - 1000) { reachedOldest = true; break; }
    }
    return { messages, reachedOldest };
}

function diffMessages(rows, scan, since) {
    const cached = new Map(rows.map(r => [r.message_id, r]));
    const fetched = new Set(scan.messages.map(m => m.id));
    const times = rows.map(r => Date.parse(r.created_at));
    const cutoff = scan.failed ? Infinity : scan.reachedOldest ? Math.min(...times) : (scan.messages.at(-1)?.createdTimestamp ?? Infinity);
    const verifiable = rows.filter(r => Date.parse(r.created_at) >= cutoff);
    return {
        deleted: verifiable.filter(r => !fetched.has(r.message_id)),
        edited: scan.messages.filter(m => cached.has(m.id) && m.editedTimestamp > since && m.content !== cached.get(m.id).content).map(m => ({ message: m, before: cached.get(m.id).content })),
        fresh: scan.messages.filter(m => !cached.has(m.id) && !m.author?.bot),
        unverifiable: rows.length - verifiable.length
    };
}

async function catchUpMessages(guild, since, budget) {
    const result = { deleted: [], edited: [], backfilled: 0, unverifiable: 0, channels: 0 };
    if (!(await messageLogsOn(guild.id))) return result;
    const rows = await loadRecentCacheRows(guild.id);
    const byChannel = new Map();
    rows.forEach(r => byChannel.set(r.channel_id, [...(byChannel.get(r.channel_id) || []), r]));

    for (const [channelId, channelRows] of byChannel) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isTextBased?.() || channel.viewable === false) {
            if (channel) result.unverifiable += channelRows.length;
            continue;
        }
        if (budget.left <= 0) { result.unverifiable += channelRows.length; continue; }
        const scan = await fetchChannelHistory(channel, Math.min(...channelRows.map(r => Date.parse(r.created_at))), budget);
        result.channels++;
        const diff = diffMessages(channelRows, scan, since);
        result.deleted.push(...diff.deleted);
        result.edited.push(...diff.edited);
        result.unverifiable += diff.unverifiable;
        diff.fresh.forEach(m => { cacheMessage(m); indexMessage(m); });
        result.backfilled += diff.fresh.length;
    }
    return result;
}

async function logOfflineMessages(guild, result) {
    const byChannel = new Map();
    result.deleted.forEach(r => byChannel.set(r.channel_id, [...(byChannel.get(r.channel_id) || []), r]));
    const files = (r) => (r.attachments || []).map(a => describeFile(a.name, a.type, a.size)).join('\n');
    for (const [channelId, rows] of byChannel) {
        if (rows.length > 5) {
            const lines = rows.sort((a, b) => a.created_at.localeCompare(b.created_at)).map(r => `[${r.created_at}] ${r.author_name ?? 'unknown'} (${r.author_id}): ${r.content}`);
            await logOffline(guild, { title: 'messages deleted', kind: 'messages', color: COLORS.danger, fields: [{ name: 'channel', value: `<#${channelId}>`, inline: true }, { name: 'count', value: String(rows.length), inline: true }], file: { name: `deleted-offline-${channelId}-${Date.now()}.txt`, content: lines.join('\n') } });
        } else {
            for (const r of rows) {
                await logOffline(guild, { title: 'message deleted', kind: 'messages', color: COLORS.danger, fields: [
                    { name: 'author', value: who({ id: r.author_id, username: r.author_name }), inline: true },
                    { name: 'channel', value: `<#${channelId}>`, inline: true },
                    { name: 'deleted by', value: 'unknown / while offline', inline: true },
                    { name: 'content', value: clip(r.content, 2800) || '*(no text)*', code: !!r.content },
                    linksField(r.content),
                    { name: 'attachments', value: files(r) },
                    { name: 'message id', value: r.message_id, inline: true },
                    { name: 'sent at', value: r.created_at, inline: true },
                    { name: 'jump', value: `https://discord.com/channels/${guild.id}/${channelId}/${r.message_id}` }
                ] });
            }
        }
    }
    forgetCachedMessages(guild.id, result.deleted.map(r => r.message_id));

    for (const { message, before } of result.edited.slice(0, 10)) {
        await logOffline(guild, { title: 'message edited', kind: 'messages', color: COLORS.action, fields: [
            { name: 'author', value: who(message.author), inline: true },
            { name: 'channel', value: `<#${message.channelId}>`, inline: true },
            { name: 'before', value: clip(before) || '*(no text)*', code: !!before },
            { name: 'after', value: clip(message.content) || '*(no text)*', code: !!message.content },
            linksField(message.content),
            { name: 'jump', value: message.url }
        ] });
    }
    result.edited.forEach(({ message }) => cacheMessage(message));
}

// downtime replay; auditlog + snapshot diff
async function catchUpGuild(guild, since, now) {
    const budget = { left: CATCHUP_MAX_REQUESTS };
    const summary = { auditLogged: 0, offlineBans: 0, structure: 0 };
    const notes = [];

    const audit = await fetchAuditSince(guild, since, budget);
    if (audit.error) notes.push(`audit log unavailable (${audit.error}); bans, kicks and timeouts during the downtime could not be checked`);
    const entries = audit.entries.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const merged = [];
    for (const entry of entries) {
        const last = merged.at(-1);
        if (last && entry.action === AuditLogEvent.MemberRoleUpdate && last.action === AuditLogEvent.MemberRoleUpdate
            && last.targetId === entry.targetId && last.executor?.id === entry.executor?.id && entry.createdTimestamp - last.createdTimestamp <= 10000) {
            (last.group ||= [last]).push(entry);
        } else merged.push(entry);
    }
    for (const entry of merged) {
        if (entry.executor?.id === client.user.id) continue;
        const desc = describeAuditEntry(entry);
        if (!desc) continue;
        await logOffline(guild, desc);
        summary.auditLogged++;
        if (desc.ban && await recordOfflineBan(guild, entry)) summary.offlineBans++;
    }

    const prev = await loadSnapshot(guild.id).catch(() => null);
    if (prev) {
        const diff = diffSnapshots(prev, takeSnapshot(guild));
        const who2 = (type, id) => { const e = entries.find(x => x.action === type && x.targetId === id); return e?.executor ? who(e.executor) : 'unknown'; };
        const post = (title, kind, color, fields) => { summary.structure++; return logOffline(guild, { title, kind, color, fields }); };
        for (const c of diff.channelsCreated) await post('channel created', 'server', COLORS.good, [{ name: 'channel', value: `<#${c.id}> (\`${c.name}\`)`, inline: true }, { name: 'moderator', value: who2(AuditLogEvent.ChannelCreate, c.id), inline: true }]);
        for (const c of diff.channelsDeleted) await post('channel deleted', 'server', COLORS.danger, [{ name: 'channel', value: `\`${c.name}\` (${c.id})`, inline: true }, { name: 'moderator', value: who2(AuditLogEvent.ChannelDelete, c.id), inline: true }]);
        for (const c of diff.channelsRenamed) await post('channel renamed', 'server', COLORS.info, [{ name: 'channel', value: `<#${c.id}>`, inline: true }, { name: 'before', value: c.from, inline: true }, { name: 'after', value: c.to, inline: true }]);
        for (const r of diff.rolesCreated) await post('role created', 'server', COLORS.good, [{ name: 'role', value: `<@&${r.id}> (\`${r.name}\`)`, inline: true }, { name: 'moderator', value: who2(AuditLogEvent.RoleCreate, r.id), inline: true }]);
        for (const r of diff.rolesDeleted) await post('role deleted', 'server', COLORS.danger, [{ name: 'role', value: `\`${r.name}\` (${r.id})`, inline: true }, { name: 'moderator', value: who2(AuditLogEvent.RoleDelete, r.id), inline: true }]);
        for (const r of diff.rolesRenamed) await post('role renamed', 'server', COLORS.info, [{ name: 'role', value: `<@&${r.id}>`, inline: true }, { name: 'before', value: r.from, inline: true }, { name: 'after', value: r.to, inline: true }]);
        if (diff.memberCount) await post('member count changed', 'members', COLORS.muted, [{ name: 'before', value: String(diff.memberCount.from), inline: true }, { name: 'now', value: String(diff.memberCount.to), inline: true }]);
    } else {
        notes.push('no earlier snapshot, so channel and role changes could not be compared this time');
    }

    let messages = { deleted: [], edited: [], backfilled: 0, unverifiable: 0, channels: 0 };
    if (supabase) {
        messages = await catchUpMessages(guild, since, budget);
        await logOfflineMessages(guild, messages);
        if (budget.left <= 0) notes.push(`stopped after ${CATCHUP_MAX_REQUESTS} requests; some channels were not checked (raise CATCHUP_MAX_REQUESTS to scan more)`);
    } else {
        notes.push('no database, so no stored messages to compare');
    }
    if (messages.unverifiable) notes.push(`${messages.unverifiable} stored message(s) could not be checked (channel not readable, or older than the pages scanned)`);

    await sendLog(guild, {
        title: 'back online: catch-up finished',
        kind: 'general',
        color: COLORS.info,
        description: `okite was offline from <t:${Math.floor(since / 1000)}:f> to <t:${Math.floor(now / 1000)}:f> (${formatDuration(now - since)}).`,
        fields: [
            { name: 'moderation events logged', value: String(summary.auditLogged), inline: true },
            { name: 'bans recorded as infractions', value: String(summary.offlineBans), inline: true },
            { name: 'channel / role changes', value: String(summary.structure), inline: true },
            { name: 'messages deleted', value: String(messages.deleted.length), inline: true },
            { name: 'messages edited', value: String(messages.edited.length), inline: true },
            { name: 'messages remembered from the gap', value: String(messages.backfilled), inline: true },
            { name: 'not recoverable', value: 'joins and leaves (Discord keeps no record), and messages sent and deleted entirely while offline. anything in the last 15 seconds before the stop may appear twice.' },
            { name: 'notes', value: notes.join('\n') }
        ]
    });
}

async function runCatchUp() {
    const now = Date.now();
    try {
        if (CATCHUP_ENABLED) {
            const since = await loadLastSeen().catch(() => lastSeenLocal);
            if (since && now - since >= CATCHUP_MIN_GAP_MS) {
                for (const guild of client.guilds.cache.values()) {
                    await catchUpGuild(guild, since, now).catch(err => console.error(`catch-up error in ${guild.id}:`, err));
                }
            }
        }
    } finally {
        heartbeatEnabled = true;
        await saveLastSeen(Date.now()).catch(err => console.error('could not save last seen:', err.message));
        await saveSnapshots().catch(err => console.error('could not save snapshots:', err.message));
    }
}

const safe = (fn) => async (...args) => {
    try { await fn(...args); } catch (err) { console.error('event log error:', err); }
};

client.on(Events.MessageDelete, safe(async (message) => {
    if (!message.guild) return;
    const forget = () => forgetCachedMessages(message.guildId, [message.id]);
    if (suppressedDeletes.delete(message.id)) return forget();
    if (message.author?.bot) return forget();
    if (!(await messageLogsOn(message.guildId))) return;

    const stored = (!message.author || message.partial || message.content == null) ? await lookupCachedMessage(message.guildId, message.id).catch(() => null) : null;
    const author = message.author ?? (stored ? { id: stored.author_id, username: stored.author_name } : null);
    const content = message.content ?? stored?.content;
    const files = message.attachments ? Array.from(message.attachments.values()).map(describeAttachmentLink).join('\n') : (stored?.attachments || []).map(a => describeFile(a.name, a.type, a.size)).join('\n');

    const pictures = await downloadAttachments(message.attachments);

    const deleter = author ? await findMessageDeleter(message.guild, author.id, message.channelId) : { kind: 'no-author' };
    const deletedBy = deleter.kind === 'mod' ? who(deleter.executor)
        : deleter.kind === 'self' ? `<@${author.id}> / self-delete`
        : deleter.kind === 'no-author' ? 'unknown / not cached'
        : 'unknown / audit log unreadable';
    await sendLog(message.guild, {
        title: 'message deleted',
        kind: 'messages',
        uploads: pictures.uploads,
        media: pictures.remote,
        color: COLORS.danger,
        fields: [
            { name: 'author', value: author ? who(author) : 'unknown (not cached)', inline: true },
            { name: 'channel', value: `<#${message.channelId}>`, inline: true },
            { name: 'deleted by', value: deletedBy, inline: true },
            { name: 'content', value: clip(content, 2800) || (message.partial && !stored ? '*(not cached)*' : '*(no text)*'), code: !!content },
            linksField(content),
            { name: 'attachments', value: files },
            { name: 'message id', value: message.id, inline: true },
            { name: 'sent at', value: message.createdAt ? message.createdAt.toISOString() : (stored?.created_at ?? ''), inline: true },
            { name: 'jump', value: `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}` }
        ]
    });
    pictures.uploads.length = 0;
    forget();
}));
client.on(Events.MessageBulkDelete, safe(async (messages, channel) => {
    const allIds = [...messages.values()].map(m => m.id);
    const unsuppressed = messages.filter(m => !suppressedDeletes.delete(m.id));
    if (unsuppressed.size === 0) return forgetCachedMessages(channel.guild.id, allIds);
    if (!(await messageLogsOn(channel.guild.id))) return;

    const uncached = [...unsuppressed.values()].filter(m => !m.author || m.content == null).map(m => m.id);
    const stored = uncached.length ? await lookupCachedMessages(channel.guild.id, uncached).catch(() => new Map()) : new Map();
    const lines = [...unsuppressed.values()]
        .sort((a, b) => (a.createdTimestamp ?? Number.MAX_SAFE_INTEGER) - (b.createdTimestamp ?? Number.MAX_SAFE_INTEGER))
        .map(m => {
            const r = stored.get(m.id);
            const time = m.createdAt?.toISOString() ?? r?.created_at ?? '?';
            return `[${time}] ${m.author?.username ?? r?.author_name ?? 'unknown'} (${m.author?.id ?? r?.author_id ?? '?'}): ${m.content ?? r?.content ?? '(not cached)'}`;
        });
    await sendLog(channel.guild, {
        title: 'bulk delete',
        kind: 'messages',
        color: COLORS.danger,
        fields: [
            { name: 'channel', value: `<#${channel.id}>`, inline: true },
            { name: 'count', value: String(unsuppressed.size), inline: true }
        ],
        file: { name: `bulk-delete-${channel.id}-${Date.now()}.txt`, content: lines.join('\n') }
    });
    forgetCachedMessages(channel.guild.id, allIds);
}));

client.on(Events.MessageUpdate, safe(async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    if (!(await messageLogsOn(newMessage.guildId))) return;

    const stored = (oldMessage.content == null || !newMessage.author) ? await lookupCachedMessage(newMessage.guildId, newMessage.id).catch(() => null) : null;
    const author = newMessage.author ?? (stored ? { id: stored.author_id, username: stored.author_name } : null);
    const before = oldMessage.content ?? stored?.content;
    if (!newMessage.partial) cacheMessage(newMessage);

    await sendLog(newMessage.guild, {
        title: 'message edited',
        kind: 'messages',
        color: COLORS.action,
        fields: [
            { name: 'author', value: who(author), inline: true },
            { name: 'channel', value: `<#${newMessage.channelId}>`, inline: true },
            { name: 'before', value: clip(before) || '*(not cached)*', code: !!before },
            { name: 'after', value: clip(newMessage.content) || '*(no text)*', code: !!newMessage.content },
            linksField(newMessage.content),
            { name: 'jump', value: newMessage.url }
        ]
    });
}));

client.on(Events.GuildDelete, safe(async (guild) => {
    if (supabase && guild.available !== false) await markGuildRemoved(guild.id);
}));

client.on(Events.GuildCreate, safe(async (guild) => {
    if (supabase) await clearGuildRemoved(guild.id);
}));

client.on(Events.GuildMemberAdd, safe(async (member) => {
    reapplyMutes(member).catch(err => console.error('mute reapply error:', err.message));
    const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
    await sendLog(member.guild, {
        title: 'member joined',
        kind: 'members',
        color: COLORS.good,
        fields: [
            { name: 'user', value: who(member.user), inline: true },
            { name: 'account created', value: `${member.user.createdAt.toISOString()} (${ageDays}d old)`, inline: true },
            { name: 'member count', value: String(member.guild.memberCount), inline: true }
        ]
    });
}));

client.on(Events.GuildMemberRemove, safe(async (member) => {
    if (botKicks.delete(`${member.guild.id}:${member.id}`)) return;
    const kick = await findExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
    await sendLog(member.guild, {
        title: kick ? 'member kicked' : 'member left',
        kind: kick ? 'moderation' : 'members',
        color: kick ? COLORS.danger : COLORS.muted,
        fields: [
            { name: 'user', value: who(member.user), inline: true },
            { name: 'joined', value: member.joinedAt ? member.joinedAt.toISOString() : '' , inline: true },
            { name: 'roles', value: member.roles?.cache.filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(', ') },
            { name: 'moderator', value: kick ? who(kick.executor) : '' },
            { name: 'reason', value: kick?.reason }
        ]
    });
}));

client.on(Events.MessageCreate, safe(async (message) => {
    if (!message.guild || message.author?.bot) return;
    if (await messageLogsOn(message.guildId)) {
        indexMessage(message);
        cacheMessage(message);
    }
    if (!process.env.TRACE_PREFIX) return handlePrefixMessage(message);
    const received = Date.now();
    await handlePrefixMessage(message);
    if (message.content.startsWith(prefixCache.get(message.guildId) ?? defaultPrefix())) {
        console.log(`trace "${message.content.slice(0, 30)}": discord to okite ${received - message.createdTimestamp}ms, okite ${Date.now() - received}ms`);
    }
}));

client.on(Events.GuildBanAdd, safe(async (ban) => {
    forgetCachedMessagesBy(ban.guild.id, ban.user.id);
    const key = `${ban.guild.id}:${ban.user.id}`;
    if (botBans.delete(key)) return;

    let settle;
    recentBans.set(key, { at: Date.now(), settled: new Promise(resolve => { settle = resolve; }) });
    setTimeout(() => recentBans.delete(key), SOFTBAN_WINDOW_MS + 10000).unref();
    try { await handleOutsideBan(ban, settle); } finally { settle(); }
}));

async function handleOutsideBan(ban, settle) {
    const entry = await findExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    const reason = entry?.reason || ban.reason;
    const moderatorId = entry?.executor?.id || client.user.id;

    const infraction = await createInfraction({
        guild_id: ban.guild.id,
        target_user_id: ban.user.id,
        moderator_id: moderatorId,
        rule_id: null,
        rule_text_snapshot: reason || 'banned (no reason given)',
        action_type: 'ban'
    });
    settle();

    await sendLog(ban.guild, {
        title: infraction ? `member banned: infraction #${infraction.case_number}` : 'member banned',
        kind: 'moderation',
        color: COLORS.danger,
        fields: [
            { name: 'user', value: who(ban.user), inline: true },
            { name: 'moderator', value: entry ? who(entry.executor) : 'unknown', inline: true },
            { name: 'reason', value: reason }
        ]
    });

    if (infraction && supabase) {
        await runBanSnapshot({ guild: ban.guild, target: ban.user, infraction, moderatorId, deleteAfter: false });
    }
}

client.on(Events.GuildBanRemove, safe(async (ban) => {
    const key = `${ban.guild.id}:${ban.user.id}`;
    if (botUnbans.delete(key)) return;
    await recentBans.get(key)?.settled;
    const softbanned = await convertQuickBanToSoftban(ban.guild.id, ban.user.id);
    const entry = await findExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    if (softbanned) {
        return sendLog(ban.guild, {
            title: `member softbanned: infraction #${softbanned.case_number}`,
            kind: 'moderation',
            color: COLORS.danger,
            fields: [
                { name: 'user', value: who(ban.user), inline: true },
                { name: 'moderator', value: entry ? who(entry.executor) : 'unknown', inline: true },
                { name: 'note', value: 'banned and unbanned within a minute, so the ban is recorded as a softban' }
            ]
        });
    }
    await sendLog(ban.guild, {
        title: 'member unbanned',
        kind: 'moderation',
        color: COLORS.good,
        fields: [
            { name: 'user', value: who(ban.user), inline: true },
            { name: 'moderator', value: entry ? who(entry.executor) : 'unknown', inline: true }
        ]
    });
}));

async function readMemberChange(oldMember, newMember) {
    const guild = newMember.guild;
    const found = { added: [], removed: [], displayName: null, timeout: null, roleEntry: null, updateEntry: null };
    const audit = (type) => findExecutor(guild, type, newMember.id);
    const change = (entry, key) => entry?.changes?.find(c => c.key === key);
    if (!oldMember.partial) {
        found.added = [...newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id)).keys()];
        found.removed = [...oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id)).keys()];
        if (oldMember.nickname !== newMember.nickname) found.displayName = { from: oldMember.nickname, to: newMember.nickname };
        if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) found.timeout = { until: newMember.communicationDisabledUntil };
        if (found.added.length || found.removed.length) found.roleEntry = await audit(AuditLogEvent.MemberRoleUpdate);
        if (found.displayName || found.timeout) found.updateEntry = await audit(AuditLogEvent.MemberUpdate);
        return found;
    }
    const [roleEntry, updateEntry] = await Promise.all([audit(AuditLogEvent.MemberRoleUpdate), audit(AuditLogEvent.MemberUpdate)]);
    found.roleEntry = roleEntry; found.updateEntry = updateEntry;
    found.added = (change(roleEntry, '$add')?.new || []).map(r => r.id);
    found.removed = (change(roleEntry, '$remove')?.new || []).map(r => r.id);
    const nick = change(updateEntry, 'nick');
    if (nick) found.displayName = { from: nick.old ?? null, to: nick.new ?? null };
    const timeout = change(updateEntry, 'communication_disabled_until');
    if (timeout) found.timeout = { until: timeout.new ? new Date(timeout.new) : null };
    return found;
}

client.on(Events.GuildMemberUpdate, safe(async (oldMember, newMember) => {
    if (!oldMember.partial && oldMember.communicationDisabledUntilTimestamp > Date.now() && !(newMember.communicationDisabledUntilTimestamp > Date.now())) {
        endPunishments(newMember.guild.id, newMember.id, 'mute').catch(() => null);
    }

    const found = await readMemberChange(oldMember, newMember);
    if (!found.added.length && !found.removed.length && !found.displayName && !found.timeout) return;
    if (found.timeout && !found.added.length && !found.removed.length && !found.displayName && found.updateEntry?.executor?.id === client.user.id) return;

    const kinds = [found.displayName && 'display-name', (found.added.length || found.removed.length) && 'roles', found.timeout && 'timeout'].filter(Boolean);
    const executor = (found.updateEntry || found.roleEntry)?.executor;
    const fields = [{ name: 'user', value: who(newMember.user), inline: true }];
    if (!executor && !(found.roleEntry || found.updateEntry)) fields.push({ name: 'moderator', value: 'unknown', inline: true });
    else if (executor && executor.id !== newMember.id) fields.push({ name: 'moderator', value: who(executor), inline: true });
    const mention = (ids) => ids.map(id => `<@&${id}>`).join(', ');
    if (found.added.length) fields.push({ name: 'role(s) added', value: mention(found.added) });
    if (found.removed.length) fields.push({ name: 'role(s) removed', value: mention(found.removed) });
    if (found.displayName) fields.push({ name: 'display-name', value: `${found.displayName.from ?? '*(none)*'} → ${found.displayName.to ?? '*(none)*'}` });
    if (found.timeout) {
        fields.push({ name: 'timeout', value: found.timeout.until ? `until ${found.timeout.until.toISOString()}` : 'removed' });
        if (found.updateEntry?.reason) fields.push({ name: 'reason', value: found.updateEntry.reason });
    }

    await sendLog(newMember.guild, { title: `member updated: ${kinds.join(', ')}`, kind: 'members', color: COLORS.action, fields });
}));

client.on(Events.ChannelCreate, safe(async (channel) => {
    if (!channel.guild) return;
    const entry = await findExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    await sendLog(channel.guild, {
        title: 'channel created',
        kind: 'server',
        color: COLORS.good,
        fields: [
            { name: 'channel', value: `<#${channel.id}> (\`${channel.name}\`)`, inline: true },
            { name: 'moderator', value: entry ? who(entry.executor) : 'unknown', inline: true }
        ]
    });
}));

client.on(Events.ChannelDelete, safe(async (channel) => {
    if (!channel.guild) return;
    const entry = await findExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    await sendLog(channel.guild, {
        title: 'channel deleted',
        kind: 'server',
        color: COLORS.danger,
        fields: [
            { name: 'channel', value: `\`${channel.name}\` (${channel.id})`, inline: true },
            { name: 'moderator', value: entry ? who(entry.executor) : 'unknown', inline: true }
        ]
    });
}));

client.on(Events.GuildRoleCreate, safe(async (role) => {
    const entry = await findExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    await sendLog(role.guild, {
        title: 'role created',
        kind: 'server',
        color: COLORS.good,
        fields: [
            { name: 'role', value: `<@&${role.id}> (\`${role.name}\`)`, inline: true },
            { name: 'moderator', value: entry ? who(entry.executor) : 'unknown', inline: true }
        ]
    });
}));

client.on(Events.GuildRoleDelete, safe(async (role) => {
    const entry = await findExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    await sendLog(role.guild, {
        title: 'role deleted',
        kind: 'server',
        color: COLORS.danger,
        fields: [
            { name: 'role', value: `\`${role.name}\` (${role.id})`, inline: true },
            { name: 'moderator', value: entry ? who(entry.executor) : 'unknown', inline: true }
        ]
    });
}));

client.on(Events.VoiceStateUpdate, safe(async (oldState, newState) => {
    if (oldState.channelId === newState.channelId) return;
    if (newState.member?.user.bot) return;

    const from = oldState.channelId ? `<#${oldState.channelId}>` : null;
    const to = newState.channelId ? `<#${newState.channelId}>` : null;
    await sendLog(newState.guild, {
        title: !from ? 'voice join' : !to ? 'voice leave' : 'voice move',
        kind: 'voice',
        color: COLORS.muted,
        fields: [
            { name: 'user', value: who(newState.member?.user), inline: true },
            { name: 'from', value: from, inline: true },
            { name: 'to', value: to, inline: true }
        ]
    });
}));

async function login() {
    try {
        await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
        if (!/disallowed intents/i.test(err.message)) throw err;
        const limited = new Client({ ...clientOptions, intents: LIMITED_INTENTS });
        for (const event of client.eventNames()) for (const listener of client.listeners(event)) limited.on(event, listener);
        client = limited;
        console.warn('reduced mode: discord has not approved the Server Members and Message Content intents for this app, so prefix commands, message text in logs and join / leave logs are off. slash commands and context menus still work.');
        await client.login(process.env.DISCORD_TOKEN);
    }
}
login().catch(err => { console.error('login failed:', err.message); process.exit(1); });
