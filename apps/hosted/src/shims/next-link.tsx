import { forwardRef } from 'react';
import { navigate } from './router';

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string | { pathname?: string; query?: Record<string, string> }; prefetch?: boolean; scroll?: boolean; replace?: boolean };

/** next/link replacement: real anchors that navigate inside the page. */
const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch: _p, scroll: _s, replace, onClick, ...rest }, ref) {
  const h = typeof href === 'string' ? href : `${href.pathname ?? ''}${href.query ? '?' + new URLSearchParams(href.query).toString() : ''}`;
  const external = /^(https?:|mailto:|tel:)/.test(h) || h.startsWith('/_blob/');
  return (
    <a
      ref={ref}
      href={external ? h : '#'}
      target={external && !h.startsWith('/_blob/') ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || external || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        navigate(h, replace);
      }}
      {...rest}
    />
  );
});
export default Link;
