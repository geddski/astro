import type { Plugin } from '../core/vite';
import MagicString from 'magic-string';
import type { AstroConfig } from '../@types/astro-core'; 

// https://github.com/vitejs/vite/discussions/5109#discussioncomment-1450726
function isSSR(options: undefined | boolean | { ssr: boolean }): boolean {
  if (options === undefined) {
    return false;
  }
  if (typeof options === 'boolean') {
    return options;
  }
  if (typeof options == 'object') {
    return !!options.ssr;
  }
  return false;
}

// This matches any JS-like file (that we know of)
// See https://regex101.com/r/Cgofir/1
const SUPPORTED_FILES = /\.(astro|svelte|vue|[cm]?js|jsx|[cm]?ts|tsx)$/;
const IGNORED_MODULES = [/astro\/dist\/runtime\/server/, /\/node-fetch\//];

export default function pluginFetch(options?: {config: AstroConfig}): Plugin {
  
  // Make fetch (via node-fetch) available to components.
  // Note: for caching fetch responses we cache the original, and then only return clones of it on each subsequent request, since request bodies can only be read once.
  const DEFINE_FETCH = `import {default as nodeFetch} from 'node-fetch';\n
    const fetch = async (url, init) => {
      ${options?.config?.devOptions?.fetchCache ? `
        global.fetchCache = global.fetchCache || {};
        if (url in global.fetchCache){
          console.log("returning from fetchCache: " + url);
          return global.fetchCache[url].clone();
        }
        else {
          console.log("adding to fetchCache: " + url);
          let response = await nodeFetch(url, init);
          global.fetchCache[url] = response;
          return response.clone();
        }
      ` : `
        return nodeFetch(url, init);
      `}
    }\n
  `;

  return {
    name: '@astrojs/vite-plugin-fetch',
    enforce: 'post',
    async transform(code, id, opts) {
      const ssr = isSSR(opts);
      // If this isn't an SSR pass, `fetch` will already be available!
      if (!ssr) {
        return null;
      }
      // Only transform JS-like files
      if (!id.match(SUPPORTED_FILES)) {
        return null;
      }
      // Optimization: only run on probable matches
      if (!code.includes('fetch')) {
        return null;
      }
      // Ignore specific modules
      for (const ignored of IGNORED_MODULES) {
        if (id.match(ignored)) {
          return null;
        }
      }
      const s = new MagicString(code);
      s.prepend(DEFINE_FETCH);
      const result = s.toString();
      const map = s.generateMap({
        source: id,
        includeContent: true,
      });
      return { code: result, map };
    },
  };
}
