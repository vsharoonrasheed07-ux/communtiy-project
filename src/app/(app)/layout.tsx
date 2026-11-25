import React from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
