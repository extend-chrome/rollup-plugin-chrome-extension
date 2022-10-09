import { outputFile } from 'fs-extra'
import { performance } from 'perf_hooks'
import { OutputOptions, rollup, RollupOptions } from 'rollup'
import { firstValueFrom, mergeMap, takeUntil } from 'rxjs'
import { ViteDevServer } from 'vite'
import { ScriptFile, scriptFiles } from './fileWriter-filesMap'
import { close$, prepFileData, serverEvent$, start$ } from './fileWriter-rxjs'
import { allFilesReady, fileReady, getFileName } from './fileWriter-utilities'
import { CrxDevAssetId, CrxDevScriptId, CrxPlugin } from './types'

export { allFilesReady, fileReady }

/**
 * Starts the file writer.
 *
 * - Signals write() to start by providing the Vite Dev Server.
 * - Runs Rollup with internal plugins to output the CRX base.
 * - CRX base includes: manifest, loader files, and public folder.
 * - Output is pure assets, no actual scripts.
 * - Resolves when Rollup completes.
 */
export async function start({
  server,
}: {
  server: ViteDevServer
}): Promise<void> {
  serverEvent$.next({ type: 'start', server })

  const plugins = server.config.plugins.filter((p): p is CrxPlugin =>
    p.name.startsWith('crx:'),
  )
  const { rollupOptions, outDir } = server.config.build
  const inputOptions: RollupOptions = {
    input: 'index.html',
    ...rollupOptions,
    plugins,
  }
  // handle the various output option types
  const rollupOutputOptions = [rollupOptions.output].flat()[0]
  const outputOptions: OutputOptions = {
    ...rollupOutputOptions,
    dir: outDir,
    format: 'es',
  }

  const build = await rollup(inputOptions)
  await build.write(outputOptions)
  await allFilesReady()
}

/** Signals write() to abandon operations. */
export async function close(): Promise<void> {
  serverEvent$.next({ type: 'close' })
}

/**
 * Gets or creates a script module by id + type.
 *
 * - Calls write() when creating, no-op if file exists.
 */
export function add(script: CrxDevAssetId | CrxDevScriptId): ScriptFile {
  const fileName = getFileName(script)
  let scriptFile = scriptFiles.get(fileName)
  if (typeof scriptFile === 'undefined') {
    scriptFile = {
      ...script,
      fileName,
      file: write(script),
    }
    scriptFiles.set(fileName, scriptFile)
  }
  return scriptFile
}

/**
 * Calls write() on each existing type of script.
 *
 * - It is possible for multiple scripts to have the same id with different types.
 * - Loaders don't get updated.
 */
export function update(id: string): ScriptFile[] {
  const types = ['iife', 'module'] as const
  const updatedFiles: ScriptFile[] = []
  for (const type of types) {
    const scriptFile = scriptFiles.get(getFileName({ id, type }))
    if (scriptFile) {
      scriptFile.file = write({ id, type })
      updatedFiles.push(scriptFile)
    }
  }
  return updatedFiles
}

/**
 * Gets file content from Vite Dev Server and writes it to file system.
 *
 * - Resolves when the file is written.
 * - Calls add() on each file dependency.
 * - Waits until the dev server is running.
 */
export async function write(
  fileId: CrxDevAssetId | CrxDevScriptId,
): Promise<{ start: number; close: number; deps: ScriptFile[] }> {
  const start = performance.now()
  const deps = await firstValueFrom(
    // wait for start event
    start$.pipe(
      // prepare either asset or script contents
      prepFileData(fileId),
      // output file and add dependencies to file writer
      mergeMap(async ({ target, source, deps }) => {
        const files = deps
          .map((id: string) => {
            const r = [add({ id, type: 'module' })]
            if (id.endsWith('?import'))
              r.push(add({ id: id.slice(0, -'?import'.length), type: 'asset' }))
            return r
          })
          .flat()
        if (source instanceof Uint8Array) await outputFile(target, source)
        else await outputFile(target, source, { encoding: 'utf8' })
        return files
      }),
      // abort write operation on close event
      takeUntil(close$),
    ),
  )
  const close = performance.now()
  return { start, close, deps }
}
