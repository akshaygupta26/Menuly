"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  LogOut,
  Smartphone,
  UtensilsCrossed,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { getProfile, updateMealSlots } from "@/actions/settings";
import { logout } from "@/actions/auth";
import type { MealType } from "@/types/database";

import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_MEAL_SLOTS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [isPending, startTransition] = useTransition();

  // Profile / Meal slots
  const [mealSlots, setMealSlots] = useState<MealType[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Auth info
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Copy-to-clipboard feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Collapsible setup guide
  const [guideOpen, setGuideOpen] = useState(false);

  // ---- Load profile and session on mount -----------------------------------
  useEffect(() => {
    async function load() {
      // Fetch profile via server action
      const { data } = await getProfile();
      if (data) {
        setMealSlots(data.meal_slots);
      }
      setProfileLoaded(true);

      // Fetch session from client-side Supabase
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setUserEmail(session.user.email ?? null);
        setAccessToken(session.access_token);
      }
    }

    load();
  }, []);

  // ---- Handlers ------------------------------------------------------------

  function handleToggleMealSlot(slot: MealType, checked: boolean) {
    const next = checked
      ? [...mealSlots, slot]
      : mealSlots.filter((s) => s !== slot);

    // Require at least one slot
    if (next.length === 0) {
      toast.error("You must have at least one meal slot enabled");
      return;
    }

    setMealSlots(next);

    startTransition(async () => {
      const { error } = await updateMealSlots(next);
      if (error) {
        toast.error(error);
        // Revert on failure
        setMealSlots(mealSlots);
      } else {
        toast.success("Meal preferences updated");
      }
    });
  }

  async function copyToClipboard(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedField(null), 3000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }

  function handleLogout() {
    startTransition(async () => {
      await logout();
    });
  }

  // ---- Derived values ------------------------------------------------------

  const apiEndpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/grocery/export?format=reminders`
      : "/api/grocery/export?format=reminders";

  // ---- Render --------------------------------------------------------------

  return (
    <>
      <Header title="Settings" subtitle="Manage your preferences and account" />

      <div className="space-y-6">
        {/* ================================================================ */}
        {/* Meal Preferences                                                 */}
        {/* ================================================================ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="size-5 text-primary" />
              Meal Preferences
            </CardTitle>
            <CardDescription>
              Choose which meal slots to include in your weekly meal plans.
              Defaults are Breakfast, Lunch, and Dinner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {profileLoaded ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {ALL_MEAL_SLOTS.map((slot) => {
                  const isChecked = mealSlots.includes(slot.value);
                  return (
                    <div key={slot.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`slot-${slot.value}`}
                        checked={isChecked}
                        disabled={isPending}
                        onCheckedChange={(checked) =>
                          handleToggleMealSlot(slot.value, checked === true)
                        }
                      />
                      <Label
                        htmlFor={`slot-${slot.value}`}
                        className="cursor-pointer"
                      >
                        {slot.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {ALL_MEAL_SLOTS.map((slot) => (
                  <div
                    key={slot.value}
                    className="flex items-center gap-2"
                  >
                    <div className="size-4 rounded-[4px] bg-muted animate-pulse" />
                    <span className="text-sm text-muted-foreground">
                      {slot.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* Apple Reminders Sync                                             */}
        {/* ================================================================ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="size-5 text-primary" />
              Apple Reminders Sync
            </CardTitle>
            <CardDescription>
              Sync your grocery list to Apple Reminders using an iOS Shortcut.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* API Endpoint */}
            <div className="space-y-2">
              <Label>API Endpoint</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-xs break-all font-mono">
                  {apiEndpoint}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(apiEndpoint, "endpoint")}
                >
                  {copiedField === "endpoint" ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Auth Token */}
            <div className="space-y-2">
              <Label>Auth Token</Label>
              {accessToken ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-xs break-all font-mono max-h-20 overflow-y-auto overflow-x-hidden">
                    {accessToken}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(accessToken, "token")}
                  >
                    {copiedField === "token" ? (
                      <Check className="size-4 text-green-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Loading session...
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                This token refreshes periodically. If the Shortcut stops
                working, copy a fresh token here.
              </p>
            </div>

            {/* Setup Guide */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setGuideOpen(!guideOpen)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                <span>Setup Guide for iOS Shortcuts</span>
                {guideOpen ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </button>

              {guideOpen && (
                <div className="border-t px-4 py-4 space-y-3 text-sm text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-2">
                    <li>
                      Open the <strong>Shortcuts</strong> app on your iPhone or
                      iPad.
                    </li>
                    <li>
                      Tap <strong>+</strong> to create a new shortcut.
                    </li>
                    <li>
                      Add a <strong>&quot;Get Contents of URL&quot;</strong>{" "}
                      action:
                      <ul className="mt-1 ml-4 list-disc space-y-1">
                        <li>
                          Set the URL to the <strong>API Endpoint</strong>{" "}
                          above.
                        </li>
                        <li>Method: <strong>GET</strong></li>
                        <li>
                          Add a Header:{" "}
                          <code className="rounded bg-muted px-1 text-xs">
                            Authorization
                          </code>{" "}
                          with value{" "}
                          <code className="rounded bg-muted px-1 text-xs">
                            Bearer &lt;your token&gt;
                          </code>
                        </li>
                      </ul>
                    </li>
                    <li>
                      Add a{" "}
                      <strong>&quot;Get Dictionary Value&quot;</strong> action
                      to extract the <code className="rounded bg-muted px-1 text-xs">items</code> array.
                    </li>
                    <li>
                      Add a{" "}
                      <strong>&quot;Repeat with Each&quot;</strong> block over
                      the items array.
                    </li>
                    <li>
                      Inside the loop, add{" "}
                      <strong>&quot;Add New Reminder&quot;</strong>:
                      <ul className="mt-1 ml-4 list-disc space-y-1">
                        <li>
                          Set the title to the <strong>Repeat Item</strong>.
                        </li>
                        <li>
                          Choose your target Reminders list (e.g.
                          &quot;Grocery&quot;).
                        </li>
                      </ul>
                    </li>
                    <li>
                      Optionally add a{" "}
                      <strong>&quot;Remove All Reminders&quot;</strong> action
                      before the loop to clear old items first.
                    </li>
                    <li>Save and run the shortcut.</li>
                  </ol>
                  <p className="mt-2 text-xs">
                    <strong>Tip:</strong> Add the shortcut to your Home Screen
                    or set it as an Automation to run automatically.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* Account                                                          */}
        {/* ================================================================ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-5 text-primary" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Email</Label>
              <p className="text-sm text-foreground">
                {userEmail ?? (
                  <span className="text-muted-foreground">Loading...</span>
                )}
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={isPending}
            >
              <LogOut className="size-4" />
              Log Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
