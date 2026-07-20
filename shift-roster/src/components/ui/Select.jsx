import React from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';

const Select = React.forwardRef(({
  className,
  label,
  error,
  options = [],
  placeholder = 'Select...',
  value,
  onChange,
  ...props
}, ref) => {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          value={value}
          onChange={onChange}
          className={cn(
            'w-full h-10 rounded-lg border border-gray-200 bg-white px-3 pr-10 text-sm text-gray-900 appearance-none cursor-pointer',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
            'transition-all duration-200',
            !value && 'text-gray-400',
            error && 'border-red-300 focus:ring-red-200 focus:border-red-400',
            className
          )}
          {...props}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.value || opt.id} value={opt.value || opt.id}>
              {opt.label || opt.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
      </div>
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;