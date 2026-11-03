import { igServe } from '@/lib/platforms/test-instagram';
import { serverClient } from '@/lib/supabase/server';

export const maxDuration = 60;

// The temporary address Meta fetches an Instagram test's file from (MVP_draft.md section 72): no account, no session, the
// token alone, and only while the test waits for Meta (at most 30 minutes). The database keeps only the token's hash. A
// wrong, ended or used token gets the same 404, and nothing here is logged.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return igServe(request, await serverClient(), token, false);
}

export async function HEAD(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return igServe(request, await serverClient(), token, true);
}
