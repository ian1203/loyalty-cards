import { Skeleton } from "../../components/ui/skeleton";

export default function RewardsLoading() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </main>
  );
}
