import { forwardRef, useId } from 'react';

const Select = forwardRef(function Select(
  { label, error, hint, required, options = [], placeholder, className = '', id, ...props }, ref
) {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div className="flex flex-col">
      {label && (
        <label htmlFor={selectId} className="field-label">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? 'true' : undefined}
        {...props}
        className={`field-control pr-8 ${className}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error ? <p className="field-error" role="alert">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
});

export default Select;