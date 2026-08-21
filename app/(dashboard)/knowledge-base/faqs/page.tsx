import { Suspense } from "react";
import { FaqWorkbench } from "@/components/knowledge/FaqWorkbench";
import { Skeleton } from "@/components/ui";

/**
 * Suspense boundary because the workbench reads the selected collection from the
 * query string, and `useSearchParams` opts a page into client rendering that
 * Next will not build without one.
 */
export default function FaqsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      }
    >
      <FaqWorkbench />
    </Suspense>
  );
}
