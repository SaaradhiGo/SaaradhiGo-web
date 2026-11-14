import type { NextRequest } from 'next/server';
import { adopt } from '@/lib/session/bff';

/** A session saved in browser storage before 14 Nov becomes cookies, once (lib/session/bff.ts). */
export const dynamic = 'force-dynamic';
export const POST = (req: NextRequest) => adopt(req, 'staff');
