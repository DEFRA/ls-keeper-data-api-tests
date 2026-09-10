import fs from 'fs'
import { parse } from 'csv-parse/sync'

/**
 * Reads and parses a PSV/CSV file from disk into an array of objects
 */
export function parseCsvFile<T = Record<string, string>>(
  filePath: string,
  delimiter?: string
): T[] {
  const content = fs.readFileSync(filePath, 'utf8')
  const firstLine = content.split(/\r?\n/)[0] || ''
  const resolvedDelimiter = delimiter || (firstLine.includes('|') ? '|' : ',')
  if (firstLine.startsWith('H|') || firstLine.startsWith('H,')) {
    const hcdt = parseHcdt(content, resolvedDelimiter)
    return hcdt.dataRows.map((row) => {
      const record: Record<string, string> = {}
      hcdt.columns.forEach((col, idx) => {
        record[col] = String(row[idx] ?? '').trim()
      })
      return record as T
    })
  }
  return parsePsvOrCsv<T>(content, resolvedDelimiter)
}

/**
 * Parses a standard PSV/CSV string into an array of objects
 */
export function parsePsvOrCsv<T = Record<string, string>>(
  content: string,
  delimiter = '|'
): T[] {
  const records = parse(content, {
    delimiter,
    quote: '"',
    relax_quotes: true,
    escape: '"',
    trim: true,
    skip_empty_lines: true,
    columns: true,
    relax_column_count: true
  }) as Record<string, string>[]

  return records.map((record) => {
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(record)) {
      cleaned[key.trim()] = String(value ?? '').trim()
    }
    return cleaned as T
  })
}

/**
 * Parsed representation of an H/C/D/T multi-record envelope file
 */
export interface HcdtParsedData {
  header: string[]
  columns: string[]
  dataRows: string[][]
  trailer: string[]
}

/**
 * Parses a legacy H/C/D/T envelope file
 */
export function parseHcdt(content: string, delimiter = '|'): HcdtParsedData {
  const lines = parse(content, {
    delimiter,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true
  }) as string[][]

  let header: string[] = []
  let columns: string[] = []
  const dataRows: string[][] = []
  let trailer: string[] = []

  for (const line of lines) {
    if (!line || line.length === 0) continue
    const recordType = line[0]?.trim()

    if (recordType === 'H') {
      header = line
    } else if (recordType === 'C') {
      columns = line.slice(1).map((c) => c.trim())
    } else if (recordType === 'D') {
      dataRows.push(line)
    } else if (recordType === 'T') {
      trailer = line
    }
  }

  return { header, columns, dataRows, trailer }
}
