"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/browser";

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  if (path.startsWith("/login")) return null;
  async function signOut() {
    await browserSupabase().auth.signOut();
    router.replace("/login");
  }
  return (
    <nav className="nav">
      <strong>looot local leads</strong>
      <Link href="/" className={path === "/" ? "on" : ""}>Campaigns</Link>
      <button onClick={signOut} className="link">Sign out</button>
    </nav>
  );
}
