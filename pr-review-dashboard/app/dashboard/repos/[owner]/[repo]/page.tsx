import { RepositoryPulls } from "@/components/dashboard/repository-pulls";

export default async function RepositoryPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return <RepositoryPulls owner={owner} name={repo} />;
}
