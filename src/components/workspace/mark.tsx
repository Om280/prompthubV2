/**
 * The brand mark: two pieces snapped together, the same notch-and-nub connector the prompt blocks
 * use. Cobalt on ink, both from tokens, so it follows the theme.
 */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <path
        d="M5 2H23A3 3 0 0 1 26 5V10A3 3 0 0 1 23 13H15V16A2 2 0 0 1 13 18H11A2 2 0 0 1 9 16V13H5A3 3 0 0 1 2 10V5A3 3 0 0 1 5 2Z"
        fill="var(--cobalt)"
      />
      <path
        d="M5 15H8V17A2 2 0 0 0 10 19H14A2 2 0 0 0 16 17V15H23A3 3 0 0 1 26 18V23A3 3 0 0 1 23 26H5A3 3 0 0 1 2 23V18A3 3 0 0 1 5 15Z"
        fill="var(--ink)"
      />
    </svg>
  );
}
