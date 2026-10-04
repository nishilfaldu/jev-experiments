"use client";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuthActions } from "@convex-dev/auth/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Analytics01Icon,
  LogoutIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();

  return (
    <SidebarProvider>
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring"
      >
        Skip to content
      </a>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="px-3 py-3">
          <Link
            href="/dashboard"
            className="flex h-9 items-center gap-3 rounded-md px-2 focus-visible:ring-3 focus-visible:ring-ring"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
              J
            </span>
            <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              just-jevving
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      pathname === "/dashboard" ||
                      pathname.startsWith("/dashboard/repos")
                    }
                    render={<Link href="/dashboard" />}
                  >
                    <HugeiconsIcon icon={SourceCodeIcon} strokeWidth={2} />
                    Repositories
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith("/dashboard/rules")}
                    render={<Link href="/dashboard/rules" />}
                  >
                    <HugeiconsIcon icon={Analytics01Icon} strokeWidth={2} />
                    Rules
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <Button
            variant="ghost"
            className="justify-start group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:px-0"
            onClick={() => {
              void signOut();
            }}
          >
            <HugeiconsIcon icon={LogoutIcon} strokeWidth={2} />
            <span className="group-data-[collapsible=icon]:hidden">
              Sign out
            </span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset id="dashboard-content" className="min-w-0">
        <header className="flex h-12 items-center border-b px-3 md:px-5">
          <SidebarTrigger />
        </header>
        <div className="flex flex-1 flex-col px-4 py-8 md:px-8 md:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
