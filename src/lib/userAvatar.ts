type UserAvatarInput = {
  name?: string | null;
  email?: string | null;
};

const KNOWN_USER_AVATARS = [
  {
    names: ["example operator", "example-client"],
    emails: ["primary@example.invalid"],
    photoUrl: "/assets/team-example-client-rose.jpeg",
  },
  {
    names: ["secondary mignone", "secondary"],
    emails: ["secondary@example.invalid"],
    photoUrl: "/assets/team-secondary-mignone.jpeg",
  },
  {
    names: ["missionAgent hayes", "missionAgent"],
    emails: ["missionAgent@example.invalid"],
    photoUrl: "/assets/team-operations-agent.jpg",
  },
];

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function getInitials(name?: string | null, email?: string | null) {
  const display = (name?.trim() || email?.split("@")[0] || "?").trim();
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return (display[0] ?? "?").toUpperCase();
}

export function resolveUserAvatar({ name, email }: UserAvatarInput) {
  const normalizedName = normalize(name);
  const normalizedEmail = normalize(email);
  const match = KNOWN_USER_AVATARS.find((entry) =>
    entry.emails.includes(normalizedEmail) || entry.names.includes(normalizedName),
  );

  return {
    photoUrl: match?.photoUrl,
    initials: getInitials(name, email),
  };
}
