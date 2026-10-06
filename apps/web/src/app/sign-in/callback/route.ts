import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/server/env';
import { finishSignIn } from '@/server/sign-in';
import { createSessionClient } from '@/server/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const failed = new URL('/sign-in?error=google', request.url);
  if (env.ESTA_GOOGLE_AUTH !== 'on' || code === null) return NextResponse.redirect(failed);
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(failed);
  return NextResponse.redirect(new URL(await finishSignIn(), request.url));
}
