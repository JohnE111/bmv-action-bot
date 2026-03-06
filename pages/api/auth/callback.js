import { Redis } from "@upstash/redis";
const kv = Redis.fromEnv();
import { getOAuthClient } from "../../../lib/calendar";

export default async function handler(req, res) {
  const { code, state: slackUserId, error } = req.query;

  if (error) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#080c14;color:#94a3b8;">
        <h2 style="color:#ef4444">Authorization failed</h2>
        <p>${error}</p>
        <p>Close this window and try again in Slack.</p>
      </body></html>
    `);
  }

  if (!code || !slackUserId) {
    return res.status(400).send("Missing code or state");
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens keyed by Slack user ID
    await kv.set(`gcal_tokens:${slackUserId}`, tokens);

    return res.status(200).send(`
      <html><body style="font-family:'DM Sans',sans-serif;text-align:center;padding:60px;background:#080c14;color:#f1f5f9;">
        <div style="font-size:48px;margin-bottom:16px">✓</div>
        <h2 style="color:#86efac;font-size:24px;margin-bottom:8px">Google Calendar connected!</h2>
        <p style="color:#64748b;font-size:15px">You're all set. Close this window and go back to Slack.<br/>
        Click <strong>Add to Calendar</strong> on any action item to create events.</p>
      </body></html>
    `);
  } catch (err) {
    console.error("OAuth error:", err);
    return res.status(500).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#080c14;color:#94a3b8;">
        <h2 style="color:#ef4444">Connection failed</h2>
        <p>${err.message}</p>
        <p>Close this window and try again.</p>
      </body></html>
    `);
  }
}
