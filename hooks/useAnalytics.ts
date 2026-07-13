import { useQuery } from "@tanstack/react-query";

type AnalyticsPeriod = "today" | "7d" | "30d" | "90d";

export function useAnalytics(period: AnalyticsPeriod = "30d") {
  return useQuery({
    queryKey: ["analytics", period],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // 10 minutes
  });
}
