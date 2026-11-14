import type { NextRequest } from 'next/server';
import { proxy } from '@/lib/session/bff';

/** The staff session's calls to the backend, with the login keys kept in HttpOnly cookies (lib/session/bff.ts). */
export const dynamic = 'force-dynamic';
const go = (req: NextRequest) => proxy(req, 'staff');
export { go as GET, go as POST, go as PUT, go as PATCH, go as DELETE };
