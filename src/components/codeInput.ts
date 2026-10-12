/** Props for a 6-digit code field (emailed codes and authenticator codes). */
export const CODE_INPUT = {
  inputMode: "numeric",
  autoComplete: "one-time-code",
  pattern: "\\d{6}",
  maxLength: 6,
  required: true,
  dir: "ltr",
  className: "font-mono text-lg tracking-[0.3em]",
} as const;
