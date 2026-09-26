import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // Private routes that must NEVER be indexed by search engines
  const privatePrefixes = [
    '/dashboard',
    '/admin',
    '/workspace',
    '/community',
    '/support',
    '/chat',
    '/claims',
    '/marketplace',
    '/api',
  ];

  const isPrivate = privatePrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isPrivate) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  } else {
    response.headers.set('X-Robots-Tag', 'index, follow');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
