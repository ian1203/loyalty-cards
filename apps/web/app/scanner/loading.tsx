import { Skeleton } from "../../components/ui/skeleton";

export default function ScannerLoading() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-56 w-full" />
    </main>
  );
}
