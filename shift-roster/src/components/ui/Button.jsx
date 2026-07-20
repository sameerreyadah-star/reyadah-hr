import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

const Button = React.forwardRef(({
  className,
  variant = 'default',
  size = 'default',
  children,
  isLoading,
  disabled,
  icon,
  ...props
}, ref) => {
  const variants = {
    default: 'bg-primary text-white hover:bg-primary-dark shadow-sm hover:shadow-md',
    primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm hover:shadow-md',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700',
    ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    default: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-6 text-base gap-2.5',
    xl: 'h-14 px-8 text-lg gap-3',
  };

  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        'active:scale-[0.98]',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : icon ? (
        <span className="h-4 w-4">{icon}</span>
      ) : null}
      {children}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;