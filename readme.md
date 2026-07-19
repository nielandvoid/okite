# okite
context-menu rule citation & range purge utility for r/BTechtards Discord

built with node and discord.js.

## features
- `lookup` message context menu command (cites server rules directly on target messages)
- custom modal input support for manual staff notices
- clean multiline blockquote formatting (`>>>`) with zero line gaps
- `mark / purge range` context menu command (stateless 2-click range purging)
- permanent media re-hosting via `files.catbox.moe` before deletion (bypasses expired discord cdn links)
- `/setlog` to configure server audit log channel

## prerequisites
* **node.js** (v18.x or higher recommended)
* a discord bot token & client id

## self-host
1. clone the repo
2. configure `.env`:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   ```
3. install dependencies & deploy commands:
   ```bash
   npm i
   node deploy.js
   ```
4. start the bot:
   ```bash
   node index.js
   ```

## server setup
1. invite the bot to your server with `bot` and `applications.commands` scopes
2. set your log channel:
   `/setlog channel:#okite-logs`
3. right-click any message ➔ **Apps** ➔ **lookup** or **mark / purge range**

## rules configuration
edit `rules.json` to customize server rules:
```json
[
  {
    "id": "r1",
    "label": "Rule 1: Civility Rule",
    "desc": "Be kind, respectful, and helpful.",
    "text": ">>> **Rule #1: Civility Rule**\nBe kind and helpful to other users."
  }
]
```

## license
mit
