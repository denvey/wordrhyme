import React from 'react';

/** @internal */
export type TBaseTextFieldProps = {
  disabled?: boolean;
  error?: boolean;
  fullWidth?: boolean;
  helperText?: React.ReactNode;
  id?: string;
  label?: React.ReactNode;
  multiline?: boolean;
  placeholder?: string;
  rows?: string | number;
  maxRows?: string | number;
  minRows?: string | number;
  value?: any;
  size?: 'small' | 'medium';
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement | HTMLInputElement>;
  variant?: 'outlined' | 'filled' | 'standard';
  className?: string;
  name?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};
/** @internal */
export type TBaseTextField = React.ComponentType<TBaseTextFieldProps>;

/** @internal */
export const BaseTextField: TBaseTextField = (props) => {
  return (
    <input
      onChange={props.onChange}
      value={props.value}
      name={props.name}
      className={props.className}
      style={props.style}
      disabled={props.disabled}
      id={props.id}
      placeholder={props.placeholder ?? (props.label as string)}
    />
  );
};
