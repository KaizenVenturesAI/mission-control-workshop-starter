"use client";

import EmailSyncHealth from "@/components/crm/EmailSyncHealth";

export default function InboundSetupPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0c0c12",
      color: "#f1f5f9",
      padding: "40px 24px",
      maxWidth: 800,
      marginInline: "auto",
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>
        Inbound Setup
      </h1>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 28 }}>
        System health, sync status, and activation controls.
      </p>

      <EmailSyncHealth />
    </div>
  );
}
