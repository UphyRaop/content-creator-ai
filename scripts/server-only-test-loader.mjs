export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export%20{}", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const relative = specifier.slice(2);
    const target = relative.match(/\.[a-z]+$/i) ? relative : `${relative}.ts`;
    return nextResolve(new URL(`../src/${target}`, import.meta.url).href, context);
  }
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    try { return await nextResolve(`${specifier}.ts`, context); } catch { /* Try Node's normal extensions next. */ }
  }
  return nextResolve(specifier, context);
}
