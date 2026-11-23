import "./interlock.css";

/**
 * The project's Turbopack rule compiles every .css file as global CSS, so CSS modules are not
 * available. Classes in interlock.css are prefixed `dc-` instead; this map keeps call sites as
 * `s.name` and makes the prefix impossible to forget.
 */
const s = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === "string" ? `dc-${key}` : undefined),
});

export default s;
