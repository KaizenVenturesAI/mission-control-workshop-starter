import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  // Generate PKCE
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  const CLIENT_ID = process.env.CANVA_CLIENT_ID;
  if (!CLIENT_ID) {
    return new NextResponse('Missing CANVA_CLIENT_ID', { status: 500 });
  }
  const REDIRECT_URI = process.env.CANVA_REDIRECT_URI || new URL('/api/canva/callback', req.url).toString();
  const SCOPES = 'asset:read design:content:read design:meta:read profile:read';

  const authUrl = new URL('https://www.canva.com/api/oauth/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Store verifier in an httpOnly cookie for 5 minutes
  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('canva_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: true,
    maxAge: 300,
    path: '/',
  });

  return response;
}
