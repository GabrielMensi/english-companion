import { type NextRequest, NextResponse } from "next/server";
import { isCrossSiteWrite } from "@/lib/cross-site";

/** Refuses API writes coming from other sites (see lib/cross-site.ts). */
export function proxy(request: NextRequest) {
  if (isCrossSiteWrite(request)) {
    return NextResponse.json({ error: "Cross-site requests aren't allowed" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
