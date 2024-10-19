import React from 'react';
import './Button.scss';

import { Icon } from 'react-feather';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  icon?: Icon;
  iconPosition?: 'start' | 'end';
  buttonStyle?: 'primary' | 'secondary' | 'danger' | 'icon';
  size?: 'small' | 'medium' | 'large';
}

export function Button({
  label,
  icon: IconComponent,
  iconPosition = 'start',
  buttonStyle = 'primary',
  size = 'medium',
  className,
  ...rest
}: ButtonProps) {
  const buttonClasses = [
    'button',
    `button--${buttonStyle}`,
    `button--${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={buttonClasses} {...rest}>
      {IconComponent && (
        <IconComponent className={`button__icon ${iconPosition === 'end' ? 'button__icon--end' : ''}`} />
      )}
      {label && <span className="button__label">{label}</span>}
    </button>
  );
}
