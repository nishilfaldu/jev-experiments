import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "./providers/convex-client-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "just-jevving",
  description:
    "Evaluate pull requests with your own violation and informational rules.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        className={cn(
          "h-full",
          "antialiased",
          geistMono.variable,
          "font-sans",
          inter.variable,
        )}
      >
        <TooltipProvider>
          <body className="min-h-full flex flex-col">
            <ConvexClientProvider>{children}</ConvexClientProvider>
          </body>
        </TooltipProvider>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
