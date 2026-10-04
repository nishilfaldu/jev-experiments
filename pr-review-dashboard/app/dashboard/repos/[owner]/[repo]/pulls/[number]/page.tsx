import { PullAnalysis } from "@/components/dashboard/pull-analysis";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export default async function PullRequestPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}) {
  const { owner, repo, number } = await params;
  const pullNumber = Number(number);
  if (!Number.isSafeInteger(pullNumber) || pullNumber <= 0) {
    return (
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyTitle>Invalid pull request</EmptyTitle>
          <EmptyDescription>{number} is not a valid number.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <PullAnalysis owner={owner} name={repo} pullNumber={pullNumber} />;
}
