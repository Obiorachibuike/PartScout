"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { apiFetch } from "@/lib/client/api";

function ProfileFormRoot({ name }: { name: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(name);
  const [pending, setPending] = React.useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      const result = await apiFetch("/api/profile", { method: "PATCH", body: { name: value.trim() } });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Could not update your profile");
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input id="display-name" value={value} onChange={(event) => setValue(event.target.value)} maxLength={120} />
      </div>
      <Button type="submit" size="sm" loading={pending} disabled={value.trim().length === 0}>
        Save name
      </Button>
    </form>
  );
}

function SignOut() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const signOut = async () => {
    setPending(true);
    try {
      const result = await apiFetch("/api/auth/logout", { method: "POST" });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Could not sign out");
        return;
      }
      toast.success("Signed out");
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" loading={pending} onClick={() => void signOut()}>
      <LogOut aria-hidden />
      Sign out
    </Button>
  );
}

export const ProfileForm = Object.assign(ProfileFormRoot, { SignOut });
