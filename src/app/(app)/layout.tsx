import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { RecipeGenerationProvider } from "@/lib/recipe-generation-context";
import { getProfile } from "@/actions/settings";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Check onboarding status
  const { data: profile } = await getProfile();
  if (profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <RecipeGenerationProvider>
      <OnboardingProvider>
        <AppShell>
          {children}
          <Toaster />
        </AppShell>
      </OnboardingProvider>
    </RecipeGenerationProvider>
  );
}
