import { build } from 'esbuild'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'lib')

await rm(out, { recursive: true, force: true })
await mkdir(join(out, 'tests'), { recursive: true })

await build({
  absWorkingDir: root,
  entryPoints: {
    index: 'src/index.ts',
    'typert.host': 'src/typert.host.ts',
    'typert.remote-client': 'src/typert.remote-client.ts',
    'tests/shared.test': 'src/tests/shared.test.ts',
    'tests/marks.test': 'src/tests/marks.test.ts',
  },
  outdir: 'lib',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  packages: 'external',
  sourcemap: true,
})

const client = await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  write: false,
  external: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    '@deepseek-ai/cordis',
  ],
  logOverride: { 'direct-eval': 'silent' },
})

const artifact = client.outputFiles[0]
if (!artifact) throw new Error('client bundle produced no output')

const body = artifact.text.replace(/\brequire\(/g, '__owRequire(')
const wrapped = `window.__ModuleLoader__.load({
  id: "dsh-official-writing",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var __owRequire = (name) => {
      if (name === "react/jsx-runtime" || name === "react/jsx-dev-runtime") {
        try { return require(name); } catch (_) { /* shell may not seed jsx-runtime */ }
        var React = require("react");
        return {
          jsx: function (type, props, key) { return React.createElement(type, key === undefined ? props : Object.assign({}, props, { key: key })); },
          jsxs: function (type, props, key) { return React.createElement(type, key === undefined ? props : Object.assign({}, props, { key: key })); },
          Fragment: React.Fragment
        };
      }
      if (name === "react-dom") {
        try { return require(name); } catch (_) {
          var React = require("react");
          var flushSync = function (fn) { return typeof fn === "function" ? fn() : fn; };
          return {
            __esModule: true,
            default: { flushSync: flushSync, createPortal: function (child) { return child; }, findDOMNode: function () { return null; } },
            flushSync: flushSync,
            createPortal: function (child) { return child; },
            findDOMNode: function () { return null; }
          };
        }
      }
      return require(name);
    };
${body.replace(/^/gm, '    ')}
    return module.exports;
  }
});
`
await writeFile(join(out, 'client.js'), wrapped)
await writeFile(
  join(out, 'index.d.ts'),
  `import type { Context } from '@deepseek-ai/cordis'\nexport const name: string\nexport const inject: string[]\nexport function apply(ctx: Context): void\n`,
)
await writeFile(
  join(out, 'typert.host.d.ts'),
  `declare const TYPERT: { package: string; face: 'host'; schemas: unknown[]; invocations: unknown[]; model: unknown }\nexport { TYPERT }\nexport default TYPERT\n`,
)
await writeFile(
  join(out, 'typert.remote-client.d.ts'),
  `declare const TYPERT_REMOTE: { package: string; descriptors: unknown[] }\nexport { TYPERT_REMOTE }\nexport default TYPERT_REMOTE\n`,
)

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
if (!pkg.dsh?.client) throw new Error('package.json missing dsh.client')
console.log('built host + client')
