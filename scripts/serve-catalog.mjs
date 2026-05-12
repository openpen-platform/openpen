import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const catalogPath = path.join(__dirname, '../examples/catalog/plugins.json')
const PORT = process.env.CATALOG_PORT ?? 3001

http.createServer((_, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(fs.readFileSync(catalogPath))
}).listen(PORT, () => {
  console.log(`Catalog dev server → http://localhost:${PORT}`)
  console.log(`Start app with:`)
  console.log(`  OPENPEN_CATALOG_URL=http://localhost:${PORT} npm run dev`)
})
