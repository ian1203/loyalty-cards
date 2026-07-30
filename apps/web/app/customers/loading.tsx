import { Skeleton } from "../../components/ui/skeleton";

export default function CustomersLoading() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-72 w-full" />
    </main>
  );
}
