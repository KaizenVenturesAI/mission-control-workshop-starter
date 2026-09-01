import { redirect } from "next/navigation";

export default function OpportunitiesPage() {
  redirect("/contacts?object=opportunities");
}
