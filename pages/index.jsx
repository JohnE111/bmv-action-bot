export default function Home() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c14",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
      color: "#f1f5f9",
      padding: 20,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap');`}</style>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: 10, padding: "6px 16px", marginBottom: 24,
          fontSize: 12, color: "#a5b4fc", letterSpacing: "0.1em",
        }}>◈ BMV ACTION BOT</div>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          Meeting Action Bot
        </h1>
        <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.7, margin: "0 0 32px" }}>
          Use <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 4 }}>/actionitems</code> in
          any Slack channel to extract action items from your Otter meeting transcripts
          and push them directly to Google Calendar.
        </p>
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12, padding: "20px 24px", textAlign: "left",
        }}>
          {[
            ["1", "Type /actionitems in Slack"],
            ["2", "Paste your Otter transcript"],
            ["3", "Review & accept action items"],
            ["4", "Events appear in Google Calendar"],
          ].map(([n, step]) => (
            <div key={n} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
              <span style={{
                background: "rgba(99,102,241,0.2)", color: "#a5b4fc",
                borderRadius: 6, width: 24, height: 24, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 12,
                fontWeight: 700, flexShrink: 0,
              }}>{n}</span>
              <span style={{ color: "#94a3b8", fontSize: 14, paddingTop: 3 }}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
