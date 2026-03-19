import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { RecipeGenerationProvider } from "@/lib/recipe-generation-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RecipeGenerationProvider>
      <AppShell>
        {children}
        <Toaster />
      </AppShell>
    </RecipeGenerationProvider>
  );
}
