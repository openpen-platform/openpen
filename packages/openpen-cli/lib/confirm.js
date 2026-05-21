import readline from 'node:readline'

/**
 * Display the plugin-install security prompt and resolve to true (proceed) or
 * false (abort). The host application loads installed plugins with full access
 * to the filesystem, network, and IPC — make the user acknowledge that before
 * a new plugin is added.
 *
 * @param {object} opts
 * @param {NodeJS.ReadableStream} opts.input  - stream to read the answer from
 * @param {NodeJS.WritableStream} opts.output - stream the prompt is written to
 * @param {string} opts.pluginId              - plugin identifier shown in the prompt
 * @returns {Promise<boolean>}
 */
export function promptInstallConfirm({ input, output, pluginId }) {
  const promptText =
    'This plugin will run with full host access (filesystem, network, IPC).\n' +
    'Evaluate the source yourself before continuing.\n' +
    `Install ${pluginId}? [y/N] `
  return new Promise((resolve) => {
    let answered = false
    const rl = readline.createInterface({ input, output, terminal: false })
    rl.on('close', () => {
      if (!answered) resolve(false)
    })
    rl.question(promptText, (answer) => {
      answered = true
      const normalized = answer.trim().toLowerCase()
      resolve(normalized === 'y' || normalized === 'yes')
      rl.close()
    })
  })
}

/**
 * Pull `--yes` / `-y` out of an arg list. The remaining args keep their order
 * so positional parsing downstream is unaffected.
 *
 * @param {string[]} args
 * @returns {{ yes: boolean, rest: string[] }}
 */
export function extractYesFlag(args) {
  const rest = args.filter((a) => a !== '--yes' && a !== '-y')
  return { yes: rest.length !== args.length, rest }
}
