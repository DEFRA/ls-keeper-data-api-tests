import fs from 'fs'
import path from 'path'
import { test as setup, expect } from '../fixtures/base.fixture.js'
import { writeCleanseSetupState } from '../helpers/cleanse-client.js'

interface SamHoldingSeedRow {
  cph: string
  featureName: string
  companyName: string
  addressPk: string
  paonDescription?: string
  street: string
  town: string
  locality: string
  postcode: string
  udprn: string
  easting: string
  northing: string
  secondaryCph: string
  animalSpeciesCode: string
  animalProductionUsageCode: string
}

function buildSamHoldingRow(row: SamHoldingSeedRow): string {
  return [
    '1', // BATCH_ID
    'I', // CHANGE_TYPE
    row.cph, // CPH
    row.featureName, // FEATURE_NAME
    row.companyName, // COMPANY_NAME
    'MAIN', // CPH_TYPE
    row.addressPk, // ADDRESS_PK
    '1', // SAON_START_NUMBER
    '', // SAON_START_NUMBER_SUFFIX
    '', // SAON_END_NUMBER
    '', // SAON_END_NUMBER_SUFFIX
    '', // SAON_DESCRIPTION
    '2', // PAON_START_NUMBER
    '', // PAON_START_NUMBER_SUFFIX
    '', // PAON_END_NUMBER
    '', // PAON_END_NUMBER_SUFFIX
    row.paonDescription || '', // PAON_DESCRIPTION
    row.street, // STREET
    row.town, // TOWN
    row.locality, // LOCALITY
    'ENGLAND', // UK_INTERNAL_CODE
    row.postcode, // POSTCODE
    'GB', // COUNTRY_CODE
    row.udprn, // UDPRN
    row.easting, // EASTING
    row.northing, // NORTHING
    '', // OS_MAP_REFERENCE
    '', // DISEASE_TYPE
    '12', // INTERVAL
    'Months', // INTERVAL_UNIT_OF_TIME
    '2025-01-01', // FEATURE_ADDRESS_FROM_DATE
    '', // FEATURE_ADDRESS_TO_DATE
    'MAIN', // CPH_RELATIONSHIP_TYPE
    row.secondaryCph, // SECONDARY_CPH
    'FACACT', // FACILITY_BUSINSS_ACTVTY_CODE
    'FACTYPE', // FACILITY_TYPE_CODE
    'FACSUB', // FCLTY_SUB_BSNSS_ACTVTY_CODE
    'ACTIVE', // FEATURE_STATUS_CODE
    '', // MOVEMENT_RSTRCTN_RSN_CODE
    row.animalSpeciesCode, // ANIMAL_SPECIES_CODE
    row.animalProductionUsageCode // ANIMAL_PRODUCTION_USAGE_CODE
  ].join('|')
}

setup(
  'ingest CTS and SAM datasets and execute Cleanse rules engine run',
  async ({ etlClient, cleanseClient }) => {
    setup.setTimeout(180000)

    // Read baseline SAM holdings and append Cleanse Rule 1 test scenarios in memory
    // matching active English CPHs from CTSM_CADS_PROD_BULK_00001_001_CT_LOCATION_IDENTIFIERS_BASELINE.csv
    const holdingFilePath = path.resolve(
      'tests/data/LITP_SAMCPHHOLDING_BASELINE.csv'
    )
    const holdingRaw = fs.readFileSync(holdingFilePath, 'utf8')

    const cleanseHoldingRows = [
      // Rule 1 Positive #1: SAM holding has non-cattle species (SHP) -> Flagged with errorCode 01
      buildSamHoldingRow({
        cph: '31/124/0042',
        featureName: 'FARM 1',
        companyName: 'Cleanse Holdings 1',
        addressPk: '25900001',
        street: 'Farm Lane',
        town: 'Test Town',
        locality: 'Ironshire',
        postcode: 'SW1A 1AA',
        udprn: '25900001',
        easting: '410001',
        northing: '510001',
        secondaryCph: '31/124/5042',
        animalSpeciesCode: 'SHP',
        animalProductionUsageCode: 'MEAT'
      }),
      // Rule 1 Positive #2: SAM holding has no animal species code -> Flagged with errorCode 01
      buildSamHoldingRow({
        cph: '21/173/0011',
        featureName: 'FARM 2',
        companyName: 'Cleanse Holdings 2',
        addressPk: '25900002',
        street: 'Farm Lane',
        town: 'Test Town',
        locality: 'Brackenshire',
        postcode: 'SW1A 1AA',
        udprn: '25900002',
        easting: '410002',
        northing: '510002',
        secondaryCph: '21/173/5011',
        animalSpeciesCode: '',
        animalProductionUsageCode: ''
      }),
      // Rule 1 Negative #1: SAM holding has Cattle (CTT) -> NOT flagged by Rule 1
      buildSamHoldingRow({
        cph: '32/199/9001',
        featureName: 'FARM 4',
        companyName: 'Cleanse Holdings 4',
        addressPk: '25900004',
        street: 'Farm Lane',
        town: 'Test Town',
        locality: 'Penshire',
        postcode: 'SW1A 1AA',
        udprn: '25900004',
        easting: '410004',
        northing: '510004',
        secondaryCph: '32/199/5001',
        animalSpeciesCode: 'CTT',
        animalProductionUsageCode: 'MEAT'
      }),
      // Rule 1 Negative #2: SAM holding has Bison (BSN) -> NOT flagged by Rule 1
      buildSamHoldingRow({
        cph: '40/139/0012',
        featureName: 'FARM 5',
        companyName: 'Cleanse Holdings 5',
        addressPk: '25900005',
        street: 'Farm Lane',
        town: 'Test Town',
        locality: 'Valeshire',
        postcode: 'SW1A 1AA',
        udprn: '25900005',
        easting: '410005',
        northing: '510005',
        secondaryCph: '40/139/5012',
        animalSpeciesCode: 'BSN',
        animalProductionUsageCode: 'MEAT'
      }),
      // Rule 1 Negative #3: SAM holding has Buffalo (BFF) -> NOT flagged by Rule 1
      buildSamHoldingRow({
        cph: '28/166/7000',
        featureName: 'FARM 7',
        companyName: 'Cleanse Holdings 7',
        addressPk: '25900007',
        street: 'Farm Lane',
        town: 'Test Town',
        locality: 'Oakshire',
        postcode: 'SW1A 1AA',
        udprn: '25900007',
        easting: '410007',
        northing: '510007',
        secondaryCph: '28/166/5000',
        animalSpeciesCode: 'BFF',
        animalProductionUsageCode: 'MEAT'
      })
    ]

    const combinedHoldingContent = `${holdingRaw.trimEnd()}\n${cleanseHoldingRows.join('\n')}\n`

    // Upload SAM baseline datasets (with in-memory Cleanse holding rows)
    await etlClient.uploadFile(
      'LITP_SAMCPHHOLDING_BASELINE.csv',
      undefined,
      combinedHoldingContent
    )
    await etlClient.uploadFile('LITP_SAMCPHHOLDER_BASELINE.csv')
    await etlClient.uploadFile('LITP_SAMPARTY_BASELINE.csv')
    await etlClient.uploadFile('LITP_SAMHERD_BASELINE.csv')

    // Upload all 6 CTS baseline datasets untouched
    await etlClient.uploadFile(
      'CTSM_CADS_PROD_BULK_00001_001_CT_LOCATION_IDENTIFIERS_BASELINE.csv'
    )
    await etlClient.uploadFile(
      'CTSM_CADS_PROD_BULK_00001_001_CT_LOCATIONS_BASELINE.csv'
    )
    await etlClient.uploadFile(
      'CTSM_CADS_PROD_BULK_00001_001_CT_ADDRESSES_BASELINE.csv'
    )
    await etlClient.uploadFile(
      'CTSM_CADS_PROD_BULK_00001_001_CT_COUNTIES_BASELINE.csv'
    )
    await etlClient.uploadFile(
      'CTSM_CADS_PROD_BULK_00001_001_CT_PARTIES_BASELINE.csv'
    )
    await etlClient.uploadFile(
      'CTSM_CADS_PROD_BULK_00001_001_CT_LOCATION_PARTY_RELS_BASELINE.csv'
    )

    // Run Data Bridge ETL import to compile DuckDB and export the SQLite snapshot for Cleanse
    const importStatus = await etlClient.importDataset()
    expect(importStatus.status).toMatch(/^(Succeeded|Completed)$/)

    // Trigger the Cleanse rules engine and poll until the run completes
    const completedRun = await cleanseClient.triggerAndWaitForRun()
    expect(completedRun.state).toBe('completed')
    expect(completedRun.recordsProcessed).toBeGreaterThan(0)

    // Persist run metadata for downstream Cleanse rule specs
    writeCleanseSetupState({
      runId: completedRun.runId,
      recordsProcessed: completedRun.recordsProcessed,
      completedAtUtc: completedRun.finishedAtUtc
    })
  }
)
