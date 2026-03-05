import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function extractActionItems(transcript, meetingTitle = "Team Meeting") {
  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    system: `You are an expert meeting analyst for Beantown Media Ventures (BMV), a B2B tech PR agency.
Extract every action item, to-do, and commitment from meeting transcripts.

Return ONLY a valid JSON array, no markdown, no explanation.

Each item must have:
- task: string (clear, specific action in imperative form — "Send proposal to client", not "he said he'd send")
- assignee: string (first name only: John, Makailey, Eleanor — or "Team" if unclear/everyone)
- dueDate: string (YYYY-MM-DD if any date mentioned, otherwise null)
- priority: "high" | "medium" | "low" (high = deadline mentioned or blocking others, low = nice-to-have)
- client: string (client/company name if mentioned: Tiltify, Durin, Storable, Billtrust, Humata, Sapient, Stamp — otherwise null)
- notes: string (1 sentence of context from the meeting, or null)

Be thorough — flag soft commitments too ("I'll try to get that done", "we should follow up").
Return ONLY the JSON array.`,
    messages: [
      {
        role: "user",
        content: `Meeting: ${meetingTitle}\n\nTranscript:\n${transcript}`,
      },
    ],
  });

  const raw = response.content[0].text;
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}
