# BMV Action Bot

Type `/actionitems` in Slack → paste Otter transcript → Claude extracts action items → your team accepts, edits, or dismisses each one → accepted items land in Google Calendar.

---

## What it does

- `/actionitems` opens a modal in Slack to paste your transcript
- Claude analyzes it and posts a card per action item to the channel
- Each card has three buttons:
  - **✓ Add to Calendar** — creates a Google Calendar event instantly, updates the card with a link
  - **✏ Edit** — opens a pre-filled modal (task, assignee, due date, priority, client, notes), saves to calendar on submit
  - **✕ Dismiss** — strikes the item from the list
- **Accept All** button at the bottom creates all items at once (with a confirmation prompt)
- First-time users get a DM with a Google Calendar connect link (one-time OAuth)

---

## Deploy to Vercel (no terminal needed)

### Step 1 — Push to GitHub

1. Go to [github.com/new](https://github.com/new) → create a **private** repo called `bmv-action-bot`
2. Upload all these project files (drag & drop into the GitHub web UI)

### Step 2 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import from GitHub → select `bmv-action-bot`
2. Click **Deploy** — defaults are fine
3. Your app URL will be something like `https://bmv-action-bot.vercel.app` — **copy this**

### Step 3 — Add Vercel KV (token storage)

1. In Vercel dashboard → your project → **Storage** tab
2. **Create Database** → **KV** → follow prompts → **Connect to Project**
3. This auto-adds the `KV_*` env vars — no action needed

---

## Google OAuth Setup (~10 min)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. **Select or create a project** (e.g. "BMV Tools")
3. **APIs & Services → Enable APIs** → search for and enable **Google Calendar API**
4. **APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: `BMV Action Bot`
   - Authorized redirect URI: `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback`
   - Click **Create**
5. Copy the **Client ID** and **Client Secret**

---

## Slack App Setup (~15 min)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From scratch**
   - Name: `BMV Action Bot`
   - Workspace: your BMV workspace

2. **OAuth & Permissions → Scopes → Bot Token Scopes** — add these:
   - `chat:write`
   - `chat:write.public`
   - `commands`
   - `im:write`

3. **Install to Workspace** (top of OAuth & Permissions page) → click through
   - Copy the **Bot User OAuth Token** (`xoxb-...`)

4. **Basic Information** → scroll to **App Credentials** → copy the **Signing Secret**

5. **Slash Commands → Create New Command**:
   - Command: `/actionitems`
   - Request URL: `https://YOUR-VERCEL-URL.vercel.app/api/slack/command`
   - Short description: `Extract action items from a meeting transcript`
   - Click **Save**

6. **Interactivity & Shortcuts**:
   - Toggle **on**
   - Request URL: `https://YOUR-VERCEL-URL.vercel.app/api/slack/interactive`
   - Click **Save Changes**

---

## Environment Variables in Vercel

Go to Vercel → your project → **Settings → Environment Variables** and add all of these:

| Variable | Value | Where to find it |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | [console.anthropic.com](https://console.anthropic.com) |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Slack app → OAuth & Permissions |
| `SLACK_SIGNING_SECRET` | `...` | Slack app → Basic Information |
| `GOOGLE_CLIENT_ID` | `...` | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | `...` | Google Cloud Console → Credentials |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback` | Your Vercel URL + path |

After adding all variables → **Redeploy** (Deployments tab → `...` → Redeploy).

---

## First Use

1. In your Slack workspace, type `/actionitems` in any channel
2. Paste a transcript, click **Extract Action Items**
3. The bot posts action item cards to the channel
4. Click **Add to Calendar** on any item
5. If it's your first time, you'll get a DM with a **Connect Google Calendar** button — click it, authorize, come back and click again
6. Each team member (Makailey, Eleanor) needs to connect their own Google account the first time they use it

---

## Customizing team members

To add/change team members, edit the `assignee` options in `pages/api/slack/interactive.js`:

```js
options: ["John", "Makailey", "Eleanor", "Team"].map(opt),
```

---

## Project structure

```
bmv-action-bot/
├── pages/
│   ├── index.jsx                    # Status/home page
│   └── api/
│       ├── slack/
│       │   ├── command.js           # /actionitems slash command
│       │   └── interactive.js       # Button clicks + modal submissions
│       └── auth/
│           └── callback.js          # Google OAuth callback
├── lib/
│   ├── analyze.js                   # Claude NLP extraction
│   ├── calendar.js                  # Google Calendar API
│   └── slack.js                     # Block Kit builders + Slack API helpers
├── .env.example                     # Environment variable template
├── next.config.js
└── package.json
```
