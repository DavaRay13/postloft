import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isCashier(token: string): boolean {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    return payload?.user_metadata?.role === 'cashier';
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const session = request.cookies.get('loftpos-session');
  const { pathname } = request.nextUrl;

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!session || isCashier(session.value)) {
      const loginUrl = new URL('/login', request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete('loftpos-session');
      return response;
    }
  }

  // Redirect logged-in users away from login page
  if (pathname === '/login') {
    if (session && !isCashier(session.value)) {
      const dashboardUrl = new URL('/dashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
}

// Config to specify matching paths
export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
