import { lazy, Suspense, type ComponentType } from 'react';

/** next/dynamic replacement backed by React.lazy. */
export default function dynamic<P = any>(loader: () => Promise<any>, opts: { ssr?: boolean; loading?: () => React.ReactNode } = {}): ComponentType<any> {
  const Lazy = lazy(async () => {
    const m = await loader();
    return { default: (m && (m.default ?? m)) as ComponentType<P> };
  });
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={opts.loading ? opts.loading() : null}>
        <Lazy {...(props as any)} />
      </Suspense>
    );
  };
}
