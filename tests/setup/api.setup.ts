import fs from 'fs'
import path from 'path'
import { test as setup } from '../fixtures/base.fixture.js'

setup(
  'ingest baseline datasets for KRDS API test suite',
  async ({ etlClient, apiClient }) => {
    setup.setTimeout(180000)

    // Generate unique run identifier and owner email for user-accounts tests
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const ownerEmail = `owner.${uniqueId}@example.test`

    // Ensure state cache directory exists and save setup state
    const cacheDir = path.resolve('.cache')
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    const statePath = path.resolve(cacheDir, 'api-setup.json')
    fs.writeFileSync(
      statePath,
      JSON.stringify({ uniqueId, ownerEmail, partyId: 'C3700099' }, null, 2),
      'utf8'
    )

    // Append a dynamic owner record to LITP_SAMPARTY_BASELINE for user onboarding tests
    // while preserving all standard static fixtures (single.owner, multi.owner, etc.)
    const partyFilePath = path.resolve('tests/data/LITP_SAMPARTY_BASELINE.csv')
    const partyRaw = fs.readFileSync(partyFilePath, 'utf8')
    const dynamicPartyRow = `1       |I          |C3700099|MR          |SingleOwner      |SingleOwner24     |P              |Person            |PartyOrg4        |37123404        |371234004    |${ownerEmail}|1                |A                       |10             |B                     |                |2                |C                       |20             |D                     |                |Party Street 4 |Town4 |Locality4 |ENGLAND         |CPH04 104|GB          |Y                           |25000004|Owner |37/004/0004\n`
    const combinedPartyContent = `${partyRaw.trimEnd()}\n${dynamicPartyRow}`

    // Append a corresponding herd record to LITP_SAMHERD_BASELINE linking C3700099 as owner of CPH 37/004/0004
    const herdFilePath = path.resolve('tests/data/LITP_SAMHERD_BASELINE.csv')
    const herdRaw = fs.readFileSync(herdFilePath, 'utf8')
    const dynamicHerdRow = `1       |I          |H3700099|37/004/0004/01|Cattle             |MEAT               |C3700099       |C3700003        |2025-01-01                 |                          |12       |Months               |            |                         \n`
    const combinedHerdContent = `${herdRaw.trimEnd()}\n${dynamicHerdRow}`

    // Purge SAM datasets from external storage so api-setup is self-contained regardless of prior runs
    const samDatasets = [
      'sam_cph_holdings',
      'sam_cph_holder',
      'sam_party',
      'sam_herd'
    ]
    for (const dataset of samDatasets) {
      await etlClient.purgeStorage({
        dataset,
        stage: 'all',
        sourceType: 'external'
      })
    }

    // Apply SAM CPH Holdings baseline and DELTA_2 sequentially so 37/002/0002 reaches 'Feature 1 Re-Updated'
    await etlClient.uploadFile('LITP_SAMCPHHOLDING_BASELINE.csv')
    await etlClient.importDataset('sam_cph_holdings')

    await etlClient.uploadFile('LITP_SAMCPHHOLDING_DELTA_2.csv')
    await etlClient.importDataset('sam_cph_holdings')

    await etlClient.uploadFile('LITP_SAMCPHHOLDER_BASELINE.csv')
    await etlClient.uploadFile(
      'LITP_SAMPARTY_BASELINE.csv',
      undefined,
      combinedPartyContent
    )
    await etlClient.uploadFile(
      'LITP_SAMHERD_BASELINE.csv',
      undefined,
      combinedHerdContent
    )

    // Ingest all uploaded datasets into DuckDB and export to SQLite read model
    await etlClient.importDataset()

    // Trigger SQLite cache refresh (cache=all) so the API picks up the fresh read model
    await apiClient.refreshSqliteCache('all', false)
  }
)
