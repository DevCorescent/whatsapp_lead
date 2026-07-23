import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface OnboardingState {
  completed: boolean;
  steps: {
    whatsapp: boolean;
    team: boolean;
    knowledge: boolean;
  };
}

export function useOnboarding() {
  return useQuery<OnboardingState>({
    queryKey: ["onboarding"],
    queryFn: async () => {
      const res = await fetch("/api/onboarding");
      if (!res.ok) throw new Error("Failed to load onboarding");
      const json = await res.json();
      return json.data as OnboardingState;
    },
    staleTime: 60_000,
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding", { method: "POST" });
      if (!res.ok) throw new Error("Failed to complete onboarding");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });
}
