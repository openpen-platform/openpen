declare module 'unzipper' {
  import type { Writable } from 'node:stream'
  interface ExtractOptions {
    path: string
  }
  interface ExtractStream extends Writable {
    promise(): Promise<void>
  }
  function Extract(opts: ExtractOptions): ExtractStream
  export default { Extract }
}
