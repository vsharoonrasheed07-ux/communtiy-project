import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const localeSchema = z.object({
  locale: z.enum(['en', 'hi', 'kn']),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = localeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
    }

    const user = await getSessionUser();
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { preferredLang: parsed.data.locale },
      });
    }

    const res = NextResponse.json({ ok: true, locale: parsed.data.locale });
    res.cookies.set('locale', parsed.data.locale, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
