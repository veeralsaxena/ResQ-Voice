function isPlaceholder(value?: string | null) {
  if (!value) return true;
  const v = value.toLowerCase();
  return v.includes("your_") || v.includes("your-project") || v.includes("placeholder");
}

function configured(value?: string | null) {
  return Boolean(value) && !isPlaceholder(value);
}

export { configured, isPlaceholder };
