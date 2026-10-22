import { createHash, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { ApiError } from './store.js';

export const issuer = 'https://auth.huyab.click';
export const webOrigin = 'https://task.huyab.click';
const claimsSchema = z.object({ sub: z.string().min(1).max(200), email: z.email(), exp: z.number().int().positive() });

export function createWebAuth(allowedEmail: string, keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(issuer + '/.well-known/jwks.json'))) {
  const email = z.email().parse(allowedEmail).toLowerCase();
  return {
    origin: webOrigin,
    redirect(action: 'login' | 'logout') {
      const url = new URL('/' + action, issuer);
      url.searchParams.set('redirect_uri', webOrigin + '/');
      return url.toString();
    },
    async authenticate(headers: Headers) {
      const cookies = (headers.get('Cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith('huyab_sso='));
      if (cookies.length !== 1) throw new ApiError(401, 'UNAUTHENTICATED');
      const token = cookies[0].slice('huyab_sso='.length);
      let claims: z.infer<typeof claimsSchema>;
      try {
        const verified = await jwtVerify(token, keys, { issuer, audience: 'huyab.click', algorithms: ['RS256'], requiredClaims: ['sub', 'email', 'exp', 'iat'] });
        claims = claimsSchema.parse(verified.payload);
      } catch {
        throw new ApiError(401, 'UNAUTHENTICATED');
      }
      if (claims.email.toLowerCase() !== email) throw new ApiError(403, 'FORBIDDEN');
      const csrf = createHash('sha256').update('task-hub-csrf\0' + token).digest('base64url');
      return { issuer, sub: claims.sub, email: claims.email, expires_at: claims.exp, csrf_token: csrf };
    },
    checkOrigin(headers: Headers, mutation = false) {
      const origin = headers.get('Origin');
      if ((origin !== null && origin !== webOrigin) || (mutation && origin !== webOrigin)) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED');
      if (headers.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403, 'ORIGIN_NOT_ALLOWED');
    },
    checkCsrf(headers: Headers, expected: string) {
      this.checkOrigin(headers, true);
      const actual = Buffer.from(headers.get('X-CSRF-Token') ?? '');
      const wanted = Buffer.from(expected);
      if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) throw new ApiError(403, 'CSRF_INVALID');
    },
  };
}

export type WebAuth = ReturnType<typeof createWebAuth>;

export function webAuthFromEnv(env: NodeJS.ProcessEnv): WebAuth | undefined {
  if (env.TASK_HUB_SSO_ALLOWED_EMAIL === undefined) return undefined;
  return createWebAuth(env.TASK_HUB_SSO_ALLOWED_EMAIL);
}
