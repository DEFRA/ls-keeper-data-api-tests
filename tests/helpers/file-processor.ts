import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * Prepares and encrypts a CSV data file with dynamic timestamp for ETL ingestion.
 * Automatically substitutes test suffixes (_BASELINE, _DELTA_1, _MALFORMED, etc.)
 * with the dynamic timestamp to match canonical backend dataset prefixes.
 */
export function prepareEncryptedFile(
  filePath: string,
  salt = process.env.DECRYPTION_SALT || '',
  customTimestamp?: string
): { filename: string; buffer: Buffer } {
  const content = fs.readFileSync(filePath)

  // 1. Determine dataset family and format timestamp
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const baseExtMatch = path
    .basename(filePath)
    .match(/(\.xsv[0-9a-zA-Z]*\.csv|\.csv)$/i)
  const ext = baseExtMatch ? baseExtMatch[0] : path.extname(filePath) || '.csv'
  const rawBaseName = path.basename(filePath).slice(0, -ext.length)
  const isCts =
    rawBaseName.startsWith('CTSM_') ||
    rawBaseName.startsWith('CADS_') ||
    rawBaseName.startsWith('CT_')

  // CTS uses yyyy-MM-dd-HHmmss; legacy litprd uses yyyyMMddHHmmss
  const timestamp =
    customTimestamp ||
    (isCts
      ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      : `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`)

  // 2. Extract canonical dataset prefix by stripping suffixes (_BASELINE, _DELTA_1, _MALFORMED, etc.)
  const baseName = rawBaseName
    .replace(
      /(_BASELINE|_DELTA_\d+|_DELTA|_MALFORMED|_STEP_\d+|_TEMP_\d+)(_(\d{4}-\d{2}-\d{2}-\d{6}|\d{14}))?$/i,
      ''
    )
    .replace(/_(\d{4}-\d{2}-\d{2}-\d{6}|\d{14})$/i, '')

  const filename = `${baseName}_${timestamp}${ext}`

  // 3. Derive password: CTS uses [datePart]_[precedingSegmentsReversed] per LKPR-207
  let password = filename
  if (isCts) {
    const nameWithoutExt = filename.split('.')[0]
    const segments = nameWithoutExt.split('_')
    const trailingTimestamp = segments[segments.length - 1]
    const datePart = trailingTimestamp.slice(0, 10)
    const preceding = segments.slice(0, -1).reverse()
    password = [datePart, ...preceding].join('_')
  }

  // 4. If HCDT envelope, trim field padding and dynamically inject filename and timestamp into H and T records
  let fileText = content.toString('utf8')
  if (isCts && (fileText.startsWith('H|') || fileText.startsWith('H,'))) {
    const delim = fileText.includes('|') ? '|' : ','
    const hcdtTimestamp = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    const lines = fileText.split(/\r?\n/)
    const processedLines = lines.map((line) => {
      if (line.startsWith('H' + delim)) {
        return `H${delim}${filename}${delim}${hcdtTimestamp}`
      }
      if (line.startsWith('T' + delim)) {
        const parts = line.split(delim).map((p) => p.trim())
        const count = parts[parts.length - 1]
        return `T${delim}${filename}${delim}${hcdtTimestamp}${delim}${count}`
      }
      if (line.startsWith('C' + delim) || line.startsWith('D' + delim)) {
        return line
          .split(delim)
          .map((p) => p.trim())
          .join(delim)
      }
      return line
    })
    fileText = processedLines.join('\n')
  }
  const payloadBuffer = Buffer.from(fileText, 'utf8')

  // 5. Derive key (PBKDF2 SHA-1, 32 iterations) & encrypt AES-256-ECB
  const saltBuf = Buffer.from(salt, 'utf8')
  const actualSalt =
    saltBuf.length < 8
      ? Buffer.concat([saltBuf, Buffer.alloc(8 - saltBuf.length)])
      : saltBuf
  const key = crypto.pbkdf2Sync(password, actualSalt, 32, 32, 'sha1')
  const cipher = crypto.createCipheriv('aes-256-ecb', key, null)
  const buffer = Buffer.concat([cipher.update(payloadBuffer), cipher.final()])

  return { filename, buffer }
}
