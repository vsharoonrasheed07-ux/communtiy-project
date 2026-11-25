import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getSessionCookieOptions,
  signSessionToken,
  verifyPassword,
} from '@/lib/auth';
import { loginSchema } from '@/lib/validators';
import { checkLoginRateLimit, resetLoginRateLimit } from '@/lib/rate-limit';
import { getClientIp, writeAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid credentials payload' },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    const ip = getClientIp();
    const rateKey = `${ip}:${email}`;
    const rate = checkLoginRateLimit(rateKey);

    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: `Too many login attempts. Please wait ${rate.retryAfterSeconds} seconds.`,
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      await writeAuditLog({
        userEmail: email,
        action: 'LOGIN_FAILED',
        entityType: 'Auth',
        details: { reason: 'user_not_found_or_inactive' },
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      await writeAuditLog({
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        action: 'LOGIN_FAILED',
        entityType: 'Auth',
        details: { reason: 'invalid_password' },
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    resetLoginRateLimit(rateKey);

    const token = await signSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      preferredLang: user.preferredLang,
    });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action: 'LOGIN',
      entityType: 'Auth',
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        preferredLang: user.preferredLang,
      },
    });

    response.cookies.set(getSessionCookieOptions(token));
    response.cookies.set('locale', user.preferredLang || 'en', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Unable to process login' }, { status: 500 });
  }
}
