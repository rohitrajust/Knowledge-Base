"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MnemoLogo } from "@/components/MnemoLogo";
import { UstMark } from "@/components/UstMark";
import { Button } from "@/components/ui/Button";

export function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-brand-800/80 px-4 text-white backdrop-blur-xl backdrop-saturate-150 sm:px-6">
      <Link href="/spaces" className="flex items-center gap-2">
        <MnemoLogo />
      </Link>
      <div className="flex items-center gap-4">
        {user && <span className="hidden text-sm text-white/80 sm:inline">{user.display_name}</span>}
        <Button
          variant="ghost-invert"
          size="sm"
          onClick={async () => {
            await logout();
            router.push("/login");
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Log out
        </Button>
        <div className="hidden items-center border-l border-white/20 pl-4 sm:flex">
          <UstMark variant="white" className="h-8" />
        </div>
      </div>
    </header>
  );
}
