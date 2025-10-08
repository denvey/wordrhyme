import { getStore } from '@cromwell/core';
import { isValidElementType } from 'react-is';
import React from 'react';

type TLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href?: string;
  children?: React.ReactNode;
  className?: string;
};

export const Link = (props: TLinkProps) => {
  const NextLink = getStore().nodeModules?.modules?.['next/link']?.default;
  const { href, children, ...anchorProps } = props;

  if (href && NextLink && isValidElementType(NextLink)) {
    return (
      <NextLink href={href} {...(anchorProps ?? {})}>
        {children ?? ''}
      </NextLink>
    );
  }
  return (
    <a href={href} {...(anchorProps ?? {})}>
      {children ?? ''}
    </a>
  );
};
