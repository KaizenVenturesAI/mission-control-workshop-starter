export function DashboardHomeStyles() {
  return (
    <style>{`
      @keyframes client-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.4; transform: scale(0.75); }
      }
      @keyframes client-shimmer {
        0%, 100% { opacity: 0.35; }
        50%       { opacity: 0.7;  }
      }
      .client-kpi-card {
        transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
      }
      .client-kpi-card:hover {
        border-color: rgba(255,255,255,0.14) !important;
        background: rgba(255,255,255,0.05) !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.35);
      }
      .client-agent-card {
        transition: border-color 0.18s ease, background 0.18s ease;
      }
      .client-agent-card:hover {
        border-color: rgba(255,255,255,0.14) !important;
        background: rgba(255,255,255,0.04) !important;
      }
      .client-qa-item {
        transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
      }
      .client-qa-item:hover {
        transform: translateX(3px);
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      }
    `}</style>
  );
}
