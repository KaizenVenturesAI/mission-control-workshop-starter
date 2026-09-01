export function DashboardHomeHeader({
  isMobile,
  greeting,
  dateStr,
}: {
  isMobile: boolean;
  greeting: string;
  dateStr: string;
}) {
  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.28)",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            fontWeight: 600,
          }}
        >
          Command Center
        </span>
      </div>
      <h1
        style={{
          fontSize: isMobile ? 24 : 30,
          fontWeight: 700,
          color: "rgba(255,255,255,0.92)",
          letterSpacing: "-0.03em",
          marginBottom: 3,
          lineHeight: 1.15,
        }}
      >
        {greeting}, Alex
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.38)",
          marginBottom: 30,
        }}
      >
        {dateStr} · Example Client pipeline, follow-ups, and agent lanes
      </p>
    </>
  );
}
