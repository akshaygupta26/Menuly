"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Check, RefreshCw, Users, LogOut, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";

import {
  getHousehold,
  createHousehold,
  joinHousehold,
  leaveHousehold,
  regenerateInviteCode,
  removeMember,
} from "@/actions/household";
import type { HouseholdWithMembers } from "@/types/database";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HouseholdSection() {
  const [isPending, startTransition] = useTransition();
  const [household, setHousehold] = useState<HouseholdWithMembers | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Form state
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);

  // Confirmation dialogs
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // Copy feedback
  const [copied, setCopied] = useState(false);

  // ---- Derived values (before handlers so they can reference) ---------------
  const isOwner = currentUserId != null && household?.owner_id === currentUserId;

  // ---- Load on mount -------------------------------------------------------
  useEffect(() => {
    async function load() {
      const { data } = await getHousehold();
      if (data) {
        setHousehold(data.household);
        setCurrentUserId(data.currentUserId);
      }
      setLoaded(true);
    }
    load();
  }, []);

  // ---- Handlers -----------------------------------------------------------

  function handleCreate() {
    if (!createName.trim()) {
      toast.error("Enter a household name");
      return;
    }
    startTransition(async () => {
      const { data, error } = await createHousehold(createName.trim());
      if (error) {
        toast.error(error);
        return;
      }
      setHousehold(data);
      setShowCreateForm(false);
      setCreateName("");
      toast.success("Household created!");
    });
  }

  function handleJoin() {
    if (joinCode.length !== 6) {
      toast.error("Enter a 6-character invite code");
      return;
    }
    startTransition(async () => {
      const { data, error } = await joinHousehold(joinCode);
      if (error) {
        toast.error(error);
        return;
      }
      setHousehold(data);
      setShowJoinForm(false);
      setJoinCode("");
      toast.success("Joined household!");
    });
  }

  function handleLeave() {
    setShowLeaveConfirm(false);
    startTransition(async () => {
      const { error } = await leaveHousehold();
      if (error) {
        toast.error(error);
        return;
      }
      setHousehold(null);
      toast.success(isOwner ? "Household dissolved" : "Left household");
    });
  }

  function handleRegenerateCode() {
    startTransition(async () => {
      const { data, error } = await regenerateInviteCode();
      if (error) {
        toast.error(error);
        return;
      }
      if (household && data) {
        setHousehold({ ...household, invite_code: data.invite_code });
      }
      toast.success("Invite code regenerated");
    });
  }

  function handleRemoveMember(userId: string) {
    setRemovingUserId(null);
    startTransition(async () => {
      const { error } = await removeMember(userId);
      if (error) {
        toast.error(error);
        return;
      }
      if (household) {
        setHousehold({
          ...household,
          members: household.members.filter((m) => m.user_id !== userId),
        });
      }
      toast.success("Member removed");
    });
  }

  async function copyInviteCode() {
    if (!household) return;
    try {
      await navigator.clipboard.writeText(household.invite_code);
      setCopied(true);
      toast.success("Invite code copied");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Failed to copy");
    }
  }

  // ---- Render --------------------------------------------------------------

  if (!loaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Household
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  // ---- No household state --------------------------------------------------

  if (!household) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Household
          </CardTitle>
          <CardDescription>
            Share recipes, meal plans, and grocery lists with a partner.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showCreateForm && !showJoinForm && (
            <div className="flex gap-3">
              <Button onClick={() => setShowCreateForm(true)}>
                Create Household
              </Button>
              <Button variant="outline" onClick={() => setShowJoinForm(true)}>
                Join Household
              </Button>
            </div>
          )}

          {showCreateForm && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="household-name">Household Name</Label>
                <Input
                  id="household-name"
                  placeholder='e.g. "The Smiths"'
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={isPending}>
                  {isPending ? "Creating..." : "Create"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {showJoinForm && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="invite-code">Invite Code</Label>
                <Input
                  id="invite-code"
                  placeholder="ABC123"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z2-9]/g, "")
                        .slice(0, 6)
                    )
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  className="font-mono tracking-widest text-center text-lg uppercase"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleJoin}
                  disabled={isPending || joinCode.length !== 6}
                >
                  {isPending ? "Joining..." : "Join"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowJoinForm(false);
                    setJoinCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- In household state --------------------------------------------------

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Household
          </CardTitle>
          <CardDescription>{household.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Members */}
          <div className="space-y-2">
            <Label>Members</Label>
            <div className="space-y-2">
              {household.members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">
                      {member.email ?? "Unknown"}
                    </span>
                    {member.role === "owner" && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">
                        Owner
                      </span>
                    )}
                    {member.user_id === currentUserId && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </div>
                  {isOwner && member.user_id !== currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setRemovingUserId(member.user_id)}
                      disabled={isPending}
                      aria-label={`Remove ${member.email ?? "member"}`}
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Invite Code (owner only) */}
          {isOwner && (
            <div className="space-y-2">
              <Label>Invite Code</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-center font-mono text-lg tracking-widest">
                  {household.invite_code}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyInviteCode}
                  aria-label="Copy invite code"
                >
                  {copied ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRegenerateCode}
                  disabled={isPending}
                  aria-label="Regenerate invite code"
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this code with your partner to join the household.
              </p>
            </div>
          )}

          {/* Leave / Dissolve */}
          <Button
            variant="destructive"
            onClick={() => setShowLeaveConfirm(true)}
            disabled={isPending}
          >
            {isOwner ? (
              <>
                <Trash2 className="size-4" />
                Dissolve Household
              </>
            ) : (
              <>
                <LogOut className="size-4" />
                Leave Household
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Leave/Dissolve confirmation */}
      <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isOwner ? "Dissolve household?" : "Leave household?"}
            </DialogTitle>
            <DialogDescription>
              {isOwner
                ? "This will remove all members and return everyone's recipes to their personal libraries. This cannot be undone."
                : "Your recipes will be moved back to your personal library. You can rejoin with a new invite code."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLeaveConfirm(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeave} disabled={isPending}>
              {isOwner ? "Dissolve" : "Leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove member confirmation */}
      <Dialog
        open={removingUserId !== null}
        onOpenChange={(open) => !open && setRemovingUserId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              Their recipes will be moved back to their personal library.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemovingUserId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removingUserId && handleRemoveMember(removingUserId)}
              disabled={isPending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
