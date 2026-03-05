import { verifySlackSignature, openModal } from "../../../lib/slack";

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
  const triggerId = params.get("trigger_id");
  const channelId = params.get("channel_id");

  const modal = {
    type: "modal",
    callback_id: "transcript_modal",
    private_metadata: JSON.stringify({ channelId }),
    title: { type: "plain_text", text: "BMV Action Bot" },
    submit: { type: "plain_text", text: "Extract Action Items" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "Paste your Otter transcript below. Claude will extract action items and post them to this channel for review." },
      },
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
        label: { type: "plain_text", text: "Transcript" },
        hint: { type: "plain_text", text: "Copy & paste from Otter.ai or any transcript export" },
        element: {
          type: "plain_text_input",
          action_id: "transcript_input",
          multiline: true,
          min_length: 50,
          placeholder: {
            type: "plain_text",
            text: "John: We need to get the Tiltify report done by Friday...\nMakailey: I can handle the social graphics by Thursday...",
          },
        },
      },
    ],
  };

  await openModal(triggerId, modal);
  return res.status(200).end();
}
