import { extractActionItems } from "../../../lib/analyze";
import { postSlackMessage, updateSlackMessage, buildActionItemsMessage } from "../../../lib/slack";

export const config = {
  api: { bodyParser: true },
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (req.headers["x-internal-secret"] !== process.env.INTERNAL_SECRET) {
    return res.status(401).end();
  }

  const { transcript, meetingTitle, userId, target, thinkingTs } = req.body;

  try {
    const items = await extractActionItems(transcript, meetingTitle);

    if (!items || items.length === 0) {
      await updateSlackMessage(target, thinkingTs, [
        { type: "section", text: { type: "mrkdwn", text: "🤔 No action items found. Try a more detailed transcript." } },
      ]);
      return res.status(200).end();
    }

    const blocks = buildActionItemsMessage(items, meetingTitle, userId);
    await updateSlackMessage(target, thinkingTs, blocks, `${items.length} action items from ${meetingTitle}`);
  } catch (err) {
    console.error("Analysis error:", err);
    await updateSlackMessage(target, thinkingTs, [
      { type: "section", text: { type: "mrkdwn", text: `❌ Analysis failed: ${err.message}` } },
    ]);
  }

  return res.status(200).end();
}
