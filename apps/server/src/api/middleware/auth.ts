import type { NextFunction, Request, Response } from 'express';

const BEARER_PREFIX = 'Bearer ';

function readBearerToken(authorization?: string): string | null {
  if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
    return null;
  }
  return authorization.slice(BEARER_PREFIX.length).trim() || null;
}

function getExpectedToken(): string | null {
  return process.env.API_AUTH_TOKEN ?? process.env.OPENCLAW_API_KEY ?? null;
}

export function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedToken = getExpectedToken();

  if (!expectedToken) {
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({
        message: 'Server auth is not configured. Set API_AUTH_TOKEN or OPENCLAW_API_KEY.',
      });
      return;
    }

    next();
    return;
  }

  const tokenFromAuthHeader = readBearerToken(req.headers.authorization);
  const tokenFromApiKeyHeader = req.header('x-api-key');
  const providedToken = tokenFromAuthHeader ?? tokenFromApiKeyHeader ?? null;

  if (!providedToken || providedToken !== expectedToken) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  next();
}
