import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return new NextResponse(`Canva returned error: ${error}`, { status: 400 });
  }

  if (!code) {
    return new NextResponse('Missing code', { status: 400 });
  }

  // Retrieve code verifier from cookie
  const codeVerifier = req.cookies.get('canva_code_verifier')?.value;
  if (!codeVerifier) {
    return new NextResponse('Missing code verifier in cookies. Session may have expired.', { status: 400 });
  }

  const CLIENT_ID = process.env.CANVA_CLIENT_ID;
  const CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return new NextResponse('Missing Canva OAuth environment variables', { status: 500 });
  }
  const REDIRECT_URI = process.env.CANVA_REDIRECT_URI || new URL('/api/canva/callback', req.url).toString();

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  try {
    const tokenRes = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI
      }).toString()
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return new NextResponse(JSON.stringify(tokenData, null, 2), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Clear the cookie
    const response = new NextResponse(
      `<html><body><h1>Canva Auth Complete</h1><p>OAuth flow completed successfully.</p></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
    response.cookies.delete('canva_code_verifier');

    return response;
  } catch (err: any) {
    return new NextResponse(`Server error: ${err.message}`, { status: 500 });
  }
}
