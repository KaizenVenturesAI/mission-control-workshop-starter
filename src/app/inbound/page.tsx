import { redirect } from "next/navigation";

export default function InboundPage() {
  redirect("/contacts?object=leads");
}
