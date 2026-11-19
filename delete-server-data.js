// delete one server's stored data on request; dry run, --yes deletes
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const guildId = process.argv[2];
const confirmed = process.argv.includes('--yes');
if (!/^\d{15,25}$/.test(guildId || '')) {
    console.error('usage: node delete-server-data.js <guild id> [--yes]');
    process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const TABLES = ['infractions', 'message_index', 'message_cache', 'pending_bans', 'guild_snapshots'];

(async () => {
    const counts = {};
    for (const table of TABLES) {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('guild_id', guildId);
        if (error) { console.error(`could not read ${table}: ${error.message}`); process.exit(1); }
        counts[table] = count;
    }
    console.log(`stored for guild ${guildId}:`, counts);
    if (!confirmed) { console.log('dry run. add --yes to delete it all, settings included.'); return; }

    for (const table of TABLES) {
        const { error } = await supabase.from(table).delete().eq('guild_id', guildId);
        if (error) { console.error(`failed on ${table}: ${error.message}. run it again to finish.`); process.exit(1); }
    }
    await supabase.from('bot_state').delete().in('key', [`case_floor:${guildId}`, `guild_left:${guildId}`]);
    if (process.env.MONGODB_URI) {
        const mongoose = require('mongoose');
        await mongoose.connect(process.env.MONGODB_URI);
        const { deletedCount } = await require('./models/guild').deleteOne({ guildId });
        console.log(`settings removed: ${deletedCount ? 'yes' : 'none stored'}`);
        await mongoose.disconnect();
    }
    console.log('done. if okite is still in that server it starts collecting again; remove it first for a clean end.');
})();
