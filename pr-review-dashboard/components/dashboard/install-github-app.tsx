"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";

export function InstallGitHubApp() {
  const prepareInstallation = useAction(api.analysis.prepareInstallation);
  const [url, setUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void prepareInstallation({})
      .then((result) => {
        if (!active) return;
        if (result.kind === "install") setUrl(result.url);
        else if (result.kind === "connected") return;
        else setUnavailable(true);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [prepareInstallation]);

  return (
    <Alert className="border-primary/30 bg-primary/5 p-5">
      <AlertTitle>Connect your repositories</AlertTitle>
      <AlertDescription className="mt-1">
        Choose the repositories this app may read on GitHub. They will appear
        here automatically after installation.
      </AlertDescription>
      <div className="mt-4">
        {url ? (
          <Button
            nativeButton={false}
            render={<a href={url} target="_blank" rel="noopener noreferrer" />}
          >
            Install GitHub App
          </Button>
        ) : (
          <Button disabled>
            {unavailable
              ? "Installation unavailable"
              : "Preparing install link"}
          </Button>
        )}
      </div>
      {unavailable ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          The GitHub App installation link is unavailable. Ask the app operator
          to check its GitHub credentials.
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Personal accounts only for now. Finish the GitHub flow in the new tab,
        then return here.
      </p>
    </Alert>
  );
}
