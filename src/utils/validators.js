export const required = (msg = 'This field is required') => ({
  required: msg,
});

export const email = {
  pattern: {
    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Enter a valid email address',
  },
};

export const phone = {
  pattern: {
    value: /^[0-9+\-\s()]{7,20}$/,
    message: 'Enter a valid phone number',
  },
};

export const minLength = (n) => ({
  minLength: { value: n, message: `Minimum ${n} characters` },
});

export const positiveNumber = {
  min: { value: 0.01, message: 'Must be greater than 0' },
};
