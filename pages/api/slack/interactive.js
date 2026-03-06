import { Redis } from "@upstash/redis";
const kv = Redis.fromEnv();
import { Client as QStash } from "@upstash/qstash";
const qstash = new QStash({ token: process.env.QSTASH_TOKEN });
import {
  verifySlackSignature,
  postSlackMessage,
  updateSlackMessage,
  buildActionItemsMessage,
  openModal,
} from "../../../lib/slack";
import { extractActionItems } from "../../../lib/analyze";
import { createCalendarEvent, refreshTokens, getAuthUrl } from "../../../lib/calendar";

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const rawBody = await getRawBody(req);
  if (!verifySlackSignature(req, rawBody)) return res.status(401).json({ error: "Invalid signature" });

  const params = new URLSearchParams(rawBody);
  const payload = JSON.parse(params.get("payload"));

 if (payload.type === "view_submission") {
    if (payload.view?.callback_id === "transcript_modal") await handleTranscriptSubmit(payload);
    if (payload.view?.callback_id === "edit_modal") await handleEditSubmit(payload);
    res.status(200).end();
    return;
  }

  res.status(200).end();

  if (payload.type === "block_actions") {
    const action = payload.actions[0];
    if (action.action_id === "accept_item")  await handleAccept(payload, action);
    if (action.action_id === "dismiss_item") await handleDismiss(payload, action);
    if (action.action_id === "edit_item")    await handleEditOpen(payload, action);
    if (action.action_id === "accept_all")   await handleAcceptAll(payload, action);
  }
}

async function handleTranscriptSubmit(payload) {
  const values = payload.view.state.values;
  const transcript = values.transcript?.transcript_input?.value || "";
  const meetingTitle = values.meeting_title?.title_input?.value || "Team Meeting";
  const { channelId } = JSON.parse(payload.view.private_metadata || "{}");
  const userId = payload.user.id;
  const target = channelId || userId;

  const thinkingMsg = await postSlackMessage(target, [
    { type: "context", elements: [{ type: "mrkdwn", text: `⏳ Analyzing *${meetingTitle}*...` }] },
  ]);

  await qstash.publishJSON({
    url: "https://bmv-action-bot.vercel.app/api/slack/analyze",
    headers: { "x-internal-secret": process.env.INTERNAL_SECRET || "bmv-internal-2026" },
    body: { transcript, meetingTitle, userId, target, thinkingTs: thinkingMsg.ts },
  });
}

async function handleAccept(payload, action) {
  const userId = payload.user.id;
  const channel = payload.channel.id;
  const messageTs = payload.message.ts;
  const { item, index, meetingTitle } = JSON.parse(action.value);

  const tokens = await kv.get(`gcal_tokens:${userId}`);
  if (!tokens) {
    const authUrl = getAuthUrl(userId);
    await postSlackMessage(userId, [
      { type: "section", text: { type: "mrkdwn", text: `🔗 *Connect Google Calendar first* — you only need to do this once.\nAfter connecting, click *Add to Calendar* again.` } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Connect Google Calendar →" }, url: authUrl, style: "primary", action_id: "connect_google" }] },
    ]);
    return;
  }

  try {
    let activeTokens = tokens;
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      activeTokens = await refreshTokens(tokens.refresh_token);
      await kv.set(`gcal_tokens:${userId}`, activeTokens);
    }

    const event = await createCalendarEvent(activeTokens, item, meetingTitle);

    const updatedBlocks = replaceBlock(payload.message.blocks, `actions_${index}`, {
      type: "context",
      elements: [{ type: "mrkdwn", text: `✅ *Added to calendar* by <@${userId}>${event.htmlLink ? `  ·  <${event.htmlLink}|View event>` : ""}` }],
    });
    await updateSlackMessage(channel, messageTs, updatedBlocks);
  } catch (err) {
    console.error(err);
    await postSlackMessage(userId, [
      { type: "section", text: { type: "mrkdwn", text: `❌ Couldn't create event: ${err.message}` } },
    ]);
  }
}

async function handleDismiss(payload, action) {
  const userId = payload.user.id;
  const channel = payload.channel.id;
  const messageTs = payload.message.ts;
  const { index } = JSON.parse(action.value);

  const updatedBlocks = replaceBlock(payload.message.blocks, `actions_${index}`, {
    type: "context",
    elements: [{ type: "mrkdwn", text: `~~Dismissed by <@${userId}>~~` }],
  });
  await updateSlackMessage(channel, messageTs, updatedBlocks);
}

async function handleEditOpen(payload, action) {
  const { item, index, meetingTitle } = JSON.parse(action.value);
  const channel = payload.channel.id;
  const messageTs = payload.message.ts;

  const modal = {
    type: "modal",
    callback_id: "edit_modal",
    private_metadata: JSON.stringify({ channel, messageTs, index, meetingTitle }),
    title: { type: "plain_text", text: "Edit Action Item" },
    submit: { type: "plain_text", text: "Save & Add to Calendar" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*Editing item ${index + 1}* — adjust any fields, then save to create the calendar event.` } },
      { type: "divider" },
      {
        type: "input", block_id: "edit_task",
        label: { type: "plain_text", text: "Task" },
        element: { type: "plain_text_input", action_id: "task_input", initial_value: item.task },
      },
      {
        type: "input", block_id: "edit_assignee",
        label: { type: "plain_text", text: "Assign To" },
        element: {
          type: "static_select", action_id: "assignee_input",
          initial_option: opt(item.assignee || "Team"),
          options: ["John", "Makailey", "Eleanor", "Team"].map(opt),
        },
      },
      {
        type: "input", block_id: "edit_due", optional: true,
        label: { type: "plain_text", text: "Due Date" },
        element: {
          type: "datepicker", action_id: "due_input",
          placeholder: { type: "plain_text", text: "Pick a date" },
          ...(item.dueDate ? { initial_date: item.dueDate } : {}),
        },
      },
      {
        type: "input", block_id: "edit_time", optional: true,
        label: { type: "plain_text", text: "Time (optional)" },
        hint: { type: "plain_text", text: "Leave blank to create an all-day event" },
        element: {
          type: "timepicker", action_id: "time_input",
          placeholder: { type: "plain_text", text: "Pick a time" },
        },
      },
      {
        type: "input", block_id: "edit_priority",
        label: { type: "plain_text", text: "Priority" },
        element: {
          type: "static_select", action_id: "priority_input",
          initial_option: opt(cap(item.priority || "medium")),
          options: ["High", "Medium", "Low"].map(opt),
        },
      },
      {
        type: "input", block_id: "edit_client", optional: true,
        label: { type: "plain_text", text: "Client" },
        element: {
          type: "plain_text_input", action_id: "client_input",
          placeholder: { type: "plain_text", text: "Tiltify, Durin, Storable..." },
          ...(item.client ? { initial_value: item.client } : {}),
        },
      },
      {
        type: "input", block_id: "edit_notes", optional: true,
        label: { type: "plain_text", text: "Notes" },
        element: {
          type: "plain_text_input", action_id: "notes_input",
          placeholder: { type: "plain_text", text: "Optional context..." },
          ...(item.notes ? { initial_value: item.notes } : {}),
        },
      },
    ],
  };

  await openModal(payload.trigger_id, modal);
}

async function handleEditSubmit(payload) {
  const userId = payload.user.id;
  const { channel, messageTs, index, meetingTitle } = JSON.parse(payload.view.private_metadata);
  const v = payload.view.state.values;

 const updatedItem = {
    task:     v.edit_task?.task_input?.value,
    assignee: v.edit_assignee?.assignee_input?.selected_option?.value,
    dueDate:  v.edit_due?.due_input?.selected_date || null,
    dueTime:  v.edit_time?.time_input?.selected_time || null,
    priority: (v.edit_priority?.priority_input?.selected_option?.value || "Medium").toLowerCase(),
    client:   v.edit_client?.client_input?.value || null,
    notes:    v.edit_notes?.notes_input?.value || null,
  };

  const tokens = await kv.get(`gcal_tokens:${userId}`);
  if (!tokens) {
    const authUrl = getAuthUrl(userId);
    await postSlackMessage(userId, [
      { type: "section", text: { type: "mrkdwn", text: `🔗 <${authUrl}|Connect Google Calendar> first, then try again.` } },
    ]);
    return;
  }

  try {
    let activeTokens = tokens;
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      activeTokens = await refreshTokens(tokens.refresh_token);
      await kv.set(`gcal_tokens:${userId}`, activeTokens);
    }

    const event = await createCalendarEvent(activeTokens, updatedItem, meetingTitle);

    const EMOJI = { high: "🔴", medium: "🟡", low: "🟢" };
    const due = updatedItem.dueDate ? `  📅 ${updatedItem.dueDate}` : "";
    const client = updatedItem.client ? `  🏷 ${updatedItem.client}` : "";

    // Fetch current blocks to update
    const currentBlocks = await getMessageBlocks(channel, messageTs);
    const updatedBlocks = replaceBlock(currentBlocks, `actions_${index}`, {
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `${EMOJI[updatedItem.priority] || "🟡"} *${updatedItem.task}*  ·  👤 ${updatedItem.assignee}${due}${client}\n✅ *Edited & added to calendar* by <@${userId}>${event.htmlLink ? `  ·  <${event.htmlLink}|View event>` : ""}`,
      }],
    });

    await updateSlackMessage(channel, messageTs, updatedBlocks);
  } catch (err) {
    console.error(err);
    await postSlackMessage(userId, [
      { type: "section", text: { type: "mrkdwn", text: `❌ Couldn't create event: ${err.message}` } },
    ]);
  }
}

async function handleAcceptAll(payload, action) {
  const userId = payload.user.id;
  const channel = payload.channel.id;
  const messageTs = payload.message.ts;
  const { items, meetingTitle } = JSON.parse(action.value);

  const tokens = await kv.get(`gcal_tokens:${userId}`);
  if (!tokens) {
    const authUrl = getAuthUrl(userId);
    await postSlackMessage(userId, [
      { type: "section", text: { type: "mrkdwn", text: `🔗 <${authUrl}|Connect Google Calendar> first, then click Accept All again.` } },
    ]);
    return;
  }

  let activeTokens = tokens;
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    activeTokens = await refreshTokens(tokens.refresh_token);
    await kv.set(`gcal_tokens:${userId}`, activeTokens);
  }

  let created = 0;
  for (const item of items) {
    try { await createCalendarEvent(activeTokens, item, meetingTitle); created++; }
    catch (e) { console.error(e); }
  }

  const summaryBlocks = [
    { type: "header", text: { type: "plain_text", text: `✅ ${created}/${items.length} events added — ${meetingTitle}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: `All items accepted by <@${userId}>. Check Google Calendar.` }] },
    { type: "divider" },
    ...items.map((item) => ({
      type: "context",
      elements: [{ type: "mrkdwn", text: `✓ *${item.task}*  ·  👤 ${item.assignee}${item.dueDate ? `  ·  📅 ${item.dueDate}` : ""}` }],
    })),
  ];

  await updateSlackMessage(channel, messageTs, summaryBlocks);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function replaceBlock(blocks, blockId, replacement) {
  return blocks.map((b) => (b.block_id === blockId ? replacement : b));
}

async function getMessageBlocks(channel, ts) {
  const res = await fetch(
    `https://slack.com/api/conversations.history?channel=${channel}&latest=${ts}&limit=1&inclusive=true`,
    { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } }
  );
  const data = await res.json();
  return data.messages?.[0]?.blocks || [];
}

const opt = (name) => ({ text: { type: "plain_text", text: name }, value: name });
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
