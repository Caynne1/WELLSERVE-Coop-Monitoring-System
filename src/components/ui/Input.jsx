import { forwardRef } from 'react';

const Input = forwardRef(function Input(
  { label, error, required, className = '', ...props }, ref
) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        ref={ref}
        {...props}
        className={`px-3 py-2 text-sm border rounded-lg w-full
          focus:outline-none focus:ring-2 focus:ring-blue-500 transition
          ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}
          disabled:bg-gray-100 disabled:cursor-not-allowed ${className}`}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
});

export default Input;
