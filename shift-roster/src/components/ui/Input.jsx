import React from 'react';
import { cn } from '../../lib/utils';

const Input = React.forwardRef(({ className, label, error, icon, ...props }, ref) => {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900',
            'placeholder:text-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
            'transition-all duration-200',
            icon && 'pl-10',
            error && 'border-red-300 focus:ring-red-200 focus:border-red-400',
            className
          )}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;