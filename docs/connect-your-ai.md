# Connect your AI to Acture

There are two ways to connect Acture with ChatGPT, Claude or another assistant you already use. They work in opposite directions, and you can use both.

| | **1. Import your chat history** | **2. Connect over MCP** |
|---|---|---|
| Direction | Your chatbot's history → Acture | Your chatbot ↔ Acture, live |
| What it does | Reads what you have told ChatGPT/Claude and saves the useful facts about you as Acture memories | Lets your chatbot see your day, look things up, save what it learns about you, and suggest tasks and events |
| How often | Once (repeat whenever you like) | Always on, until you revoke the token |
| Effort | About 5 minutes, plus waiting for the export email | About 5 minutes per chatbot |

Both are in **Acture → Settings → Connect your AI**.

---

## 1. Import your chat history

### What gets sent, and what doesn't

- The export is unpacked **in your browser**. Only **your own messages** are kept. The assistant's replies, images, audio and files are thrown away before anything leaves your device.
- Only your most recent conversations are used, up to about 80,000 characters. Messages longer than 500 characters are cut short, because long pastes are usually code or documents, not facts about you.
- That text goes to Acture's AI, which suggests memories. **Nothing is saved until you tick the ones you want and press Save.**
- The AI is told to skip passwords, account numbers, addresses, other people's private details and unnecessary medical detail.

### Option A: upload a ChatGPT export

1. In ChatGPT, open **Settings → Data controls → Export data → Export**.
2. Wait for the email from OpenAI. It can take from a few minutes to a day. Download the `.zip` from the link. The link expires after 24 hours.
3. In Acture, go to **Settings → Connect your AI → Upload ChatGPT or Claude export** and choose the `.zip`. You don't need to unzip it first. A `conversations.json` taken out of the zip also works.
4. Wait while it reads. It usually takes 10–40 seconds.
5. Review the list. Untick anything that's wrong or that you don't want remembered, then press **Save selected**.

### Option B: upload a Claude export

1. In Claude, open **Settings → Privacy → Export data**.
2. Download the `.zip` from the email.
3. Follow steps 3–5 above. The upload button accepts both formats and tells them apart automatically.

### Option C: paste a summary (fastest, no export needed)

This works with any chatbot that has memory or a long history, such as ChatGPT with Memory, Claude Projects or Gemini.

1. In **Settings → Connect your AI**, press **Copy prompt**.
2. Paste it into your chatbot. It asks the chatbot to list the lasting facts it knows about you.
3. Copy the chatbot's answer, paste it into the box in Acture, and press **Find memories**.
4. Review the list and save.

### After importing

- Everything you saved appears under **What Acture remembers**. The trash icon deletes a memory.
- The Acture assistant sees these memories in every chat and uses them without mentioning it. For example, it won't suggest morning workouts if you told ChatGPT you train in the evenings.
- Importing again is safe. Memories Acture already has are skipped.

---

## 2. Connect your chatbot over MCP

MCP (Model Context Protocol) is a standard way for an AI assistant to use outside tools. Once connected, you can ask your chatbot things like:

- "What's on my plate today in Acture?"
- "Add a task to finish the essay by Friday." This creates a **proposal** you approve in Acture.
- "Log that I did my run."
- "Remember that I'm off work on Wednesdays." This is saved quietly to Acture's memory.

### What the chatbot can and cannot do

| Can, immediately | Needs your approval in Acture (Proposals tab) | Cannot |
|---|---|---|
| Read your day, goals, tasks, habits, events and notes | Create goals, habits, tasks, projects, events, courses, exams, assignments and content series | Read your settings, tokens, or the raw log Acture learns from |
| Search, and read one item in detail | Rename or delete anything | Change your account |
| Add notes, journal entries, habit logs and health metrics; mark tasks done | | |
| Save and forget memories and availability | | |

### Step 1: create a token

1. In Acture, go to **Settings → Connect your AI → Create token**, and name it after the chatbot (for example "Claude desktop").
2. **Copy the token now.** It is shown only once. Acture stores only a fingerprint of it, so a lost token can't be recovered. Revoke it and create a new one.
3. Note the **server URL** shown above the token list. It looks like `https://your-acture-domain/api/mcp`.

Create a separate token for each chatbot so you can revoke one without affecting the others. The list shows when each token was last used.

> **Your Acture must be reachable from the internet** for Claude.ai or ChatGPT to connect. A local `localhost` address only works with apps running on the same computer (Claude Desktop, Claude Code, Cursor).

### Step 2: connect your client

#### Claude Code (CLI)

```bash
claude mcp add --transport http acture https://your-acture-domain/api/mcp \
  --header "Authorization: Bearer acture_your_token_here"
```

Check it with `/mcp` inside Claude Code.

#### Claude Desktop

Open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "acture": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://your-acture-domain/api/mcp",
        "--header", "Authorization:${ACTURE_TOKEN}"
      ],
      "env": { "ACTURE_TOKEN": "Bearer acture_your_token_here" }
    }
  }
}
```

The token goes in `env` and the argument has **no space after the colon**: several clients don't escape spaces inside `args` when they launch `npx`, which mangles the header, and a mangled header looks exactly like no header at all. If your Acture is on `http://` rather than `https://` — anything local — add `"--allow-http"` to the args.

Restart Claude Desktop. Acture's tools appear under the tools icon in the message box. This needs Node.js installed, because `mcp-remote` bridges the desktop app to a web server.

**If it says "Connection closed":** the bridge started and then died. In order of likelihood — Acture isn't running at that address; Node isn't installed, so `npx` fails; or the token never reached the server, which answers 401 and leaves the client with nothing to try. The detail is in `~/Library/Logs/Claude/mcp-server-acture.log` on macOS.

#### Claude.ai (web and mobile, custom connector)

Claude.ai custom connectors don't let you set a header, so put the token in the URL:

1. In Acture, press **Copy URL with token** right after creating the token.
2. In Claude.ai, open **Settings → Connectors → Add custom connector**.
3. Name it "Acture", paste the URL (`https://your-acture-domain/api/mcp?token=acture_…`), and save.
4. In a chat, turn Acture on from the tools menu.

Connectors added on the web also work in the Claude mobile apps.

#### ChatGPT (developer mode connector)

1. In ChatGPT, turn on **Settings → Apps & Connectors → Advanced → Developer mode**.
2. **Create** a connector, name it "Acture", and paste the **URL with token**.
3. Set authentication to **No authentication**, because the token is already in the URL.
4. In a chat, pick Acture from the tools/connectors menu.

Developer mode availability depends on your ChatGPT plan and region.

#### Cursor, Windsurf and other MCP clients

Most clients accept a remote HTTP server with headers. For Cursor, `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "acture": {
      "url": "https://your-acture-domain/api/mcp",
      "headers": { "Authorization": "Bearer acture_your_token_here" }
    }
  }
}
```

If a client only accepts a URL, use the URL-with-token form.

### Step 3: try it

Ask your chatbot: **"Use Acture to tell me what's on today."** It should call `getToday`. If it creates something structural, open Acture's **Proposals** tab to approve it.

### Tools reference

| Tool | What it does |
|---|---|
| `getToday` | Tasks due or overdue, habits due (and whether they're done), events, calendar blocks, active goals. Optional `date`. |
| `getMemory` | Saved memories, plus busy/free/preferred times. |
| `searchNodes` | Find items by keyword. |
| `readGraph` | List items, optionally filtered with `type:Goal` etc. |
| `getNodeDetail` | Full properties of one item. |
| `createNode` | Notes, journal entries, habit logs, health metrics, content ideas. |
| `createEdge` | Link two existing items. |
| `updateNodeProperties` | Status changes, completions, grades, tags. |
| `batchPropose` | Create goals/tasks/habits/events and similar, as a proposal. |
| `deleteNode` | Propose a deletion. |
| `remember` / `rememberAvailability` / `forget` | Manage Acture's memory. |

### Security notes

- **A token works like a password to your Acture data.** Don't paste it into shared documents or screenshots.
- **The URL-with-token form puts the token in the address.** Addresses can end up in logs, so prefer the header form when a client supports it, and revoke URL tokens you no longer use.
- **Revoking a token** (Settings → Connect your AI → revoke) cuts access immediately.
- **Tokens obey the sign-in allowlist.** If an email is removed from `AUTH_ALLOWED_EMAILS`, that account's tokens stop working too.
- **Structural changes always wait for your approval**, whichever chatbot proposed them.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401 Missing or invalid Acture token` | The token is mistyped, revoked, or missing its `acture_` prefix. Create a new one. |
| Claude.ai says it "couldn't connect" or asks to sign in | Use the **URL with token**. Claude.ai tries OAuth when a server rejects it without a token. |
| Works in Claude Code, not in Claude.ai or ChatGPT | Your Acture is only reachable locally. Deploy it, or expose it with a tunnel such as `cloudflared` or `ngrok`. |
| Chatbot creates tasks but nothing appears | They are proposals. Check the **Proposals** tab. |
| Import says "no conversations.json" | You uploaded a different zip. The ChatGPT/Claude export zip has `conversations.json` at the top level. |
| Import finds nothing | Most of your chats may be technical. Try the paste-a-summary option instead. |

---

## For developers

- Export parsing (browser): `src/lib/chat-export.ts`. Extraction: `src/app/api/memory/import/route.ts`. Storage: `src/lib/memory.ts` (as `Memory` nodes).
- MCP endpoint: `src/app/api/mcp/route.ts`. This is Streamable HTTP, stateless, with JSON responses and no SSE. The protocol handling is in `src/lib/mcp/server.ts`, and the tools in `src/lib/mcp/tools.ts` reuse the in-app assistant's tools from `src/lib/ai/tools.ts`, so both follow the same approval rules.
- Tokens: `src/lib/mcp/auth.ts`. They are stored as a SHA-256 hash on `ApiToken` nodes, managed through `/api/mcp/tokens`. `/api/mcp` is excluded from the session check in `src/proxy.ts` by exact path match.
- Quick check with curl:

```bash
curl -s https://your-acture-domain/api/mcp \
  -H "Authorization: Bearer acture_…" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
