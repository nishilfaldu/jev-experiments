"use client";

import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { useConvexAuth } from "convex/react";
import Link from "next/link";

export function SignInScreen() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-muted/40 px-4 py-16">
      <div className="grid w-full max-w-lg gap-10 rounded-2xl border bg-card p-8 shadow-sm md:p-10">
        <div className="grid gap-6">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              J
            </span>
            <span className="text-sm font-semibold tracking-tight">
              just-jevving
            </span>
          </div>
          <div className="grid gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              Semantic lint for pull requests
            </h1>
            <p className="text-sm text-muted-foreground">
              Your rules, with the probability attached.
            </p>
          </div>
        </div>
        <div className="grid gap-3 border-t pt-6">
          {isLoading ? (
            <Button size="lg" disabled>
              Checking session
            </Button>
          ) : isAuthenticated ? (
            <Button
              nativeButton={false}
              render={<Link href="/dashboard" />}
              size="lg"
            >
              Open dashboard
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => {
                void signIn("github");
              }}
            >
              <HugeiconsIcon icon={GithubIcon} strokeWidth={2} />
              Sign in with GitHub
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
