// src/app/(auth)/onboarding/layout.tsx
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 p-4">
      <div className="w-full max-w-lg">
        {children}
      </div>
    </div>
  );
}
