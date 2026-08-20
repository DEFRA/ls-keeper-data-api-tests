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
  salt = process.env.DECRYPTION_SALT || ''
): { filename: string; buffer: Buffer } {
  const content = fs.readFileSync(filePath)

  // 1. Generate timestamp (e.g. 20260820123500)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

  // 2. Extract canonical dataset prefix by stripping suffixes (_BASELINE, _DELTA_1, _MALFORMED, etc.)
  const rawBaseName = path.basename(filePath).replace(/\.csv$/i, '')
  const baseName = rawBaseName
    .replace(
      /(_BASELINE|_DELTA(_\w+)?|_MALFORMED|_STEP(_\w+)?|_TEMP(_\w+)?)(_\d{14})?$/i,
      ''
    )
    .replace(/_\d{14}$/i, '')

  const filename = `${baseName}_${timestamp}.csv`

  // 3. Derive password (CTSM/CADS reverses segments, standard uses filename)
  const isCtsm = baseName.startsWith('CTSM_') || baseName.startsWith('CADS_')
  const password = isCtsm
    ? filename
        .replace(/\.csv$/i, '')
        .split('_')
        .reverse()
        .join('_')
    : filename

  // 4. Derive key (PBKDF2 SHA-1, 32 iterations) & encrypt AES-256-ECB
  const saltBuf = Buffer.from(salt, 'utf8')
  const actualSalt =
    saltBuf.length < 8
      ? Buffer.concat([saltBuf, Buffer.alloc(8 - saltBuf.length)])
      : saltBuf
  const key = crypto.pbkdf2Sync(password, actualSalt, 32, 32, 'sha1')
  const cipher = crypto.createCipheriv('aes-256-ecb', key, null)
  const buffer = Buffer.concat([cipher.update(content), cipher.final()])

  return { filename, buffer }
}
