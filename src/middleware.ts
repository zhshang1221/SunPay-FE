import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // allow login and static files
    if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
        return NextResponse.next();
    }

    const token = req.cookies.get("agent_portal_token")?.value;
    if (!token) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
