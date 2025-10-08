import { iconFromPath } from '@cromwell/core-frontend';
import React from 'react';
import { MenuItemTitleProps } from '../types';

export const ExpandMoreIcon = iconFromPath(<path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"></path>);

export const DefaultMenuItemTitle = ({ children, menuItemTitleText, ...restProps }: MenuItemTitleProps) => {
  const [hover, setHover] = React.useState(false);

  return (
    <div
      {...restProps}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      style={{
        padding: '6px 15px',
        backgroundColor: hover ? '#ddd' : '#fff',
        transition: '0.3s',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          color: '#111',
          fontWeight: 400,
        }}
        className={menuItemTitleText}
      >
        {children}
      </p>
    </div>
  );
};

export const DefaultIconButton = (props) => <div {...props} style={{ display: 'flex', padding: '5px' }} />;

export const DefaultPopover = (props) => (
  <div
    style={{
      display: props.open ? 'block' : 'none',
      position: 'absolute',
      top: props.anchorEl?.clientHeight + 'px',
      left: 0,
      zIndex: 10000,
      backgroundColor: '#fff',
      boxShadow: '0 2px 3px 0 rgba(0, 0, 0, 0.05), 0 0 20px 4px rgba(0, 0, 0, 0.1)',
      borderRadius: '0 0 6px 6px',
      minWidth: '200px',
    }}
  >
    {props.open && props.children}
  </div>
);
