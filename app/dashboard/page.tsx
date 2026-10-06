import type { Metadata } from "next";
import { AccountDashboard } from "@/components/AccountDashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-page px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
      <h1 className="text-[clamp(2rem,4vw,3rem)] font-medium tracking-[-0.035em]">
        Dashboard
      </h1>
      <p className="mt-3 max-w-[64ch] text-[16px] leading-relaxed text-muted">
        Create and revoke API keys, and see how they are being used. Usage
        covers the last 24 hours.
      </p>
      <AccountDashboard />
    </div>
  );
}
