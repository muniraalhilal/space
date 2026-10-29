'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/lib/queries';
import { SpaceLogo } from '@/components/brand';

/** Entry: route to the last used workspace, onboarding, or sign-in. */
export default function Index() {
  const router = useRouter();
  const me = useMe();
  useEffect(() => {
    if (me.isError) router.replace('/login');
    if (me.data) {
      const last = me.data.user.preferences.lastOrgId;
      const target = me.data.organizations.find((o) => o.id === last) ?? me.data.organizations[0];
      router.replace(target ? `/o/${target.id}` : '/onboarding');
    }
  }, [me.data, me.isError, router]);
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-pulse">
        <SpaceLogo size={40} />
      </div>
    </div>
  );
}
