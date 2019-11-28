/* eslint-env node */

import typescript from 'rollup-plugin-typescript'
import bundleImports from 'rollup-plugin-bundle-imports'
import json from 'rollup-plugin-json'

const plugins = [
  typescript(),
  json(),
  bundleImports({
    useVirtualModule: true,
    options: {
      external: ['%PATH%'],
    },
  }),
]

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'lib/index-esm.js',
        format: 'esm',
        sourcemap: 'inline',
      },
      {
        file: 'lib/index-cjs.js',
        format: 'cjs',
        sourcemap: 'inline',
      },
    ],
    external: [
      'fs-extra',
      'lodash.flatten',
      'path',
      'cosmiconfig',
      'mem',
      'cheerio',
      'firebase/app',
      'firebase/auth',
      'firebase/functions',
      'glob',
      'lodash.get',
      'ajv',
      'slash'
    ],
    plugins,
  },
]
