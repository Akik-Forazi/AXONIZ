import { ProviderDetailPage } from "@/components/axoniz/pages/settings/provider-detail";

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // params is a Promise in Next 16 — pass it through to the client component
  // which will unwrap it via React's use() hook or read useParams().
  return <ProviderDetailPage params={params} />;
}
