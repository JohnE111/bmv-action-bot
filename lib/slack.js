import crypto from "crypto";

// Verify Slack request signature
export function verifySlackSignature(req, rawBody) {
  const slackSignature = req.headers["x-slack-signature"];
  const timestamp = req.headers["x-slack-request-timestamp"];

  if (!slackSignature || !timestamp) return false;

  // Prevent replay attacks (5 min window)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false;

  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac("sha256", process.env.SLACK_SIGNING_SECRET)
    .update(sigBaseString)
    .digest("hex");
  const computedSig = `v0=${hmac}`;

  return crypto.timingSafeEqual(
    Buffer.from(computedSig),
    Buffer.from(slackSignature)
  );
}

// Post a message to Slack
export async function postSlackMessage(channel, blocks, text = "") {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, blocks, text }),
  });
  return res.json();
}

// Post an ephemeral message (only visible to one user)
export async function postEphemeral(channel, userId, blocks, text = "") {
  const res = await fetch("https://slack.com/api/chat.postEphemeral", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, user: userId, blocks, text }),
  });
  return res.json();
}

// Update an existing message
export async function updateSlackMessage(channel, ts, blocks, text = "") {
  const res = await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, ts, blocks, text }),
  });
  return res.json();
}

// Open a modal
export async function openModal(triggerId, view) {
  const res = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ trigger_id: triggerId, view }),
  });
  return res.json();
}

// Build the transcript input modal
export function buildInputModal() {
  return {
    type: "modal",
    callback_id: "transcript_modal",
    title: { type: "plain_text", text: "BMV Action Bot" },
    submit: { type: "plain_text", text: "Extract Action Items" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "meeting_title",
        optional: true,
        label: { type: "plain_text", text: "Meeting Title" },
        element: {
          type: "plain_text_input",
          action_id: "title_input",
          placeholder: { type: "plain_text", text: "e.g. Tiltify Q2 Strategy — March 5" },
        },
      },
      {
        type: "input",
        block_id: "transcript",
        label: { type: "plain_text", text: "Paste Transcript" },
        hint: { type: "plain_text", text: "Copy/paste from Otter.ai or any transcript export" },
        element: {
          type: "plain_text_input",
          action_id: "transcript_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "John: We need to get the Tiltify report done by end of week...\nMakailey: I can handle the social graphics by Thursday...",
          },
        },
      },
    ],
  };
}

const PRIORITY_EMOJI = { high: "🔴", medium: "🟡", low: "🟢" };

// Build Block Kit blocks for a single action item
export function buildActionItemBlock(item, index, meetingTitle) {
  const due = item.dueDate ? `  📅 ${item.dueDate}` : "";
  const client = item.client ? `  🏷 ${item.client}` : "";
  const priority = PRIORITY_EMOJI[item.priority] || "🟡";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${priority} *${item.task}*\n👤 ${item.assignee}${due}${client}${item.notes ? `\n_${item.notes}_` : ""}`,
      },
    },
    {
      type: "actions",
      block_id: `actions_${index}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✓ Add to Calendar" },
          style: "primary",
          action_id: "accept_item",
          value: JSON.stringify({ item, index, meetingTitle }),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "✏ Edit" },
          action_id: "edit_item",
          value: JSON.stringify({ item, index, meetingTitle }),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "✕ Dismiss" },
          action_id: "dismiss_item",
          value: JSON.stringify({ item, index, meetingTitle }),
        },
      ],
    },
    { type: "divider" },
  ];
}

// Build the full action items message
export function buildActionItemsMessage(items, meetingTitle, userId = "") {
  const header = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📋 ${items.length} Action Items — ${meetingTitle}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Extracted by BMV Action Bot${userId ? ` · requested by <@${userId}>` : ""} · Click *Add to Calendar* on each item, or use *Accept All* below`,
        },
      ],
    },
    { type: "divider" },
  ];

  const itemBlocks = items.flatMap((item, i) =>
    buildActionItemBlock(item, i, meetingTitle)
  );

  const footer = [
    {
      type: "actions",
      block_id: "accept_all_block",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✓ Accept All & Add to Calendar" },
          style: "primary",
          action_id: "accept_all",
          value: JSON.stringify({ items, meetingTitle }),
          confirm: {
            title: { type: "plain_text", text: "Accept all action items?" },
            text: { type: "mrkdwn", text: `This will create *${items.length} calendar events* on your Google Calendar. Items will be assigned to you regardless of the original assignee.` },
            confirm: { type: "plain_text", text: "Yes, add all" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        },
      ],
    },
  ];

  return [...header, ...itemBlocks, ...footer];
}
