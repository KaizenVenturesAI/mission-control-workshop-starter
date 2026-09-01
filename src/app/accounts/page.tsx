import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const select = params?.select;
  const selectStr = Array.isArray(select) ? select[0] : select;
  const target = selectStr
    ? `/contacts?object=accounts&select=${encodeURIComponent(selectStr)}`
    : "/contacts?object=accounts";
  redirect(target);
}
