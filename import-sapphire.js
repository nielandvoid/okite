// sapphire import; dry run, --yes writes
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const guildId = process.argv[2];
const confirmed = process.argv.includes('--yes');
const fileArg = process.argv.find(a => a.startsWith('--file='));
const exportFile = path.join(__dirname, 'exports', fileArg ? fileArg.slice(7) : 'cases.json');
if (!/^\d{15,25}$/.test(guildId || '')) {
    console.error('usage: node import-sapphire.js <guild id> [--file=name] [--yes]');
    process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const ACTIONS = { WARN: 'manual', MASSWARN: 'manual', MUTE: 'mute', MASSMUTE: 'mute', KICK: 'kick', BAN: 'ban', MASSBAN: 'ban' };

function parseDate(created, listDate) {
    const m = String(created || '').match(/^(\d+)\/(\d+)\/(\d{4}),\s*(\d+):(\d+):(\d+)\s*([AP]M)$/i);
    if (m) {
        let h = Number(m[4]) % 12;
        if (m[7].toUpperCase() === 'PM') h += 12;
        return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], h, +m[5], +m[6]));
    }
    const d = String(listDate || '').match(/^(\d+)\/(\d+)\/(\d{4})$/);
    return d ? new Date(Date.UTC(+d[3], +d[1] - 1, +d[2])) : null;
}

function parseDuration(text) {
    if (!text || /^permanent$/i.test(text) || /^0 seconds$/i.test(text)) return null;
    const years = text.match(/^(\d+) years/);
    return years && Number(years[1]) >= 99 ? null : text;
}

(async () => {
    const raw = fs.readFileSync(exportFile, 'utf8');
    const cases = exportFile.endsWith('.ndjson')
        ? raw.split('\n').filter(Boolean).map(l => JSON.parse(l))
        : JSON.parse(raw).cases;
    const rows = [];
    const skipped = [];
    for (const c of cases) {
        const created = parseDate(c.created, c.list?.date);
        const target = c.user?.id || c.list?.userId;
        if (!created || !target || !ACTIONS[c.type]) { skipped.push(c.id); continue; }
        const reason = (c.reason || c.list?.reason || '').trim();
        const proof = (c.proof || '').trim();
        const evidence = [...new Set(proof.match(/https?:\/\/[^\s<>)\]]+/g) || [])];
        rows.push({
            guild_id: guildId,
            target_user_id: target,
            moderator_id: c.author?.id || 'unknown',
            rule_id: null,
            rule_text_snapshot: reason || 'not specified',
            reason: null,
            duration: parseDuration(c.duration || c.list?.duration),
            ended_at: created.toISOString(),
            action_type: ACTIONS[c.type],
            message_content: proof && proof !== '/' ? proof : null,
            evidence_urls: evidence,
            status: c.state === 'Closed' ? 'voided' : 'active',
            voided_by: c.state === 'Closed' ? 'sapphire' : null,
            void_reason: c.state === 'Closed' ? 'closed in Sapphire' : null,
            created_at: created.toISOString()
        });
    }
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    rows.forEach((r, i) => { r.case_number = i + 1; });

    const count = (key) => rows.reduce((o, r) => ((o[r[key]] = (o[r[key]] || 0) + 1), o), {});
    console.log(`${rows.length} of ${cases.length} cases ready for guild ${guildId} as #1 to #${rows.length}`);
    console.log('by type:', count('action_type'), ' by status:', count('status'));
    console.log('oldest:', rows[0].created_at, ' newest:', rows.at(-1).created_at);
    if (skipped.length) console.log(`skipped ${skipped.length} without a usable date or user:`, skipped.join(', '));

    const { count: existing, error } = await supabase.from('infractions').select('id', { count: 'exact', head: true }).eq('guild_id', guildId);
    if (error) { console.error('could not read infractions:', error.message); process.exit(1); }
    if (existing) { console.error(`guild ${guildId} already has ${existing} infractions; not importing on top of them.`); process.exit(1); }
    if (!confirmed) { console.log('dry run. add --yes to write them.'); return; }

    for (let i = 0; i < rows.length; i += 200) {
        const { error: insertError } = await supabase.from('infractions').insert(rows.slice(i, i + 200));
        if (insertError) { console.error(`failed at row ${i}: ${insertError.message}. nothing after this was written; delete the guild's rows before retrying.`); process.exit(1); }
        console.log(`wrote ${Math.min(i + 200, rows.length)}/${rows.length}`);
    }
    console.log('done.');
})();
