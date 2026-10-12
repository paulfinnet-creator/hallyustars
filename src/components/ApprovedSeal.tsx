/**
 * The red dojang seal stamped on approved invitations: "승인 / APPROVED"
 * (CLAUDE.md › Design). The Korean stays in every language, as on a real seal.
 */
export function ApprovedSeal({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex size-16 shrink-0 -rotate-6 flex-col items-center justify-center rounded-md border-[3px] border-obang-red text-obang-red shadow-[inset_0_0_0_2px_var(--color-surface),inset_0_0_0_3px_var(--color-obang-red)] dark:border-accent dark:text-accent"
    >
      <span aria-hidden="true" lang="ko" className="font-heading text-xl leading-none font-bold">
        승인
      </span>
      <span aria-hidden="true" className="mt-1 text-[0.55rem] leading-none font-semibold tracking-wider">
        APPROVED
      </span>
    </span>
  );
}
