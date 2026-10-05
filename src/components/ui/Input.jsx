import { forwardRef, useId } from 'react';

const Input = forwardRef(function Input(
  { label, error, hint, required, className = '', id, ...props }, ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className="flex flex-col">
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? 'true' : undefined}
        {...props}
        className={`field-control ${className}`}
      />
      {error ? <p className="field-error" role="alert">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
});

export default Input;