import "./studio.css";

/**
 * Class map for Direction B. The project's Turbopack rule compiles every *.css as plain CSS, so CSS
 * modules are not hashed here. Instead every selector in studio.css carries the `nb-` prefix and sits
 * under `.nb-root`; `s.header` resolves to "nb-header".
 */
const s = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === "string" ? `nb-${key}` : undefined),
});

export default s;
