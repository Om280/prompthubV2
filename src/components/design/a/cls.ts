/**
 * Class names for Direction A. The project's turbopack CSS rule compiles `*.module.css` as global CSS,
 * so this direction uses one plain stylesheet (`studio.css`) with every class prefixed `pa-`.
 * `s.sheet` returns "pa-sheet".
 */
export const s: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, key) => `pa-${String(key)}`,
});

export default s;
