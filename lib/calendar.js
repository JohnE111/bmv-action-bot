import { google } from "googleapis";

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(slackUserId) {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state: slackUserId,
  });
}

export async function createCalendarEvent(tokens, actionItem, meetingTitle) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Default to 7 days from now if no due date
  const date = actionItem.dueDate
    ? actionItem.dueDate
    : new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const descriptionLines = [
    `📋 Action item from: ${meetingTitle}`,
    actionItem.client ? `🏷 Client: ${actionItem.client}` : null,
    `👤 Assigned to: ${actionItem.assignee}`,
    `⚡ Priority: ${actionItem.priority?.toUpperCase()}`,
    actionItem.notes ? `📝 Context: ${actionItem.notes}` : null,
    "",
    "Created by BMV Action Bot",
  ].filter((l) => l !== null);

  const event = {
    summary: `[ACTION] ${actionItem.task}`,
    description: descriptionLines.join("\n"),
    start: { date },
    end: { date },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 * 9 }, // 9am day-of
        { method: "email", minutes: 60 * 24 }, // 1 day before
      ],
    },
    colorId: actionItem.priority === "high" ? "11" : actionItem.priority === "medium" ? "5" : "2",
    // 11=tomato, 5=banana, 2=sage
  };

  const result = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
  });

  return result.data;
}

// Refresh access token using stored refresh token
export async function refreshTokens(refreshToken) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}
