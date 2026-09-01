import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/permissions?tab=users");
}
