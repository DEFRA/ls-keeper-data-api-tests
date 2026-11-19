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

function buildSamHoldingRow(row: SamHoldingSeedRow, batchId: string): string {
  return [
    batchId, // BATCH_ID
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

interface SamHolderSeedRow {
  partyId: string
  familyName: string
  orgName: string
  street: string
  town: string
  locality: string
  postcode: string
  udprn: string
  cph: string
}

function buildSamHolderRow(row: SamHolderSeedRow): string {
  return [
    '1', // BATCH_ID
    'I', // CHANGE_TYPE
    row.partyId, // PARTY_ID
    'MR', // PERSON_TITLE
    'Cleanse', // PERSON_GIVEN_NAME
    '', // PERSON_GIVEN_NAME2
    'C', // PERSON_INITIALS
    row.familyName, // PERSON_FAMILY_NAME
    row.orgName, // ORGANISATION_NAME
    '01234 567890', // TELEPHONE_NUMBER
    '07123 456789', // MOBILE_NUMBER
    `${row.partyId.toLowerCase()}@example.test`, // INTERNET_EMAIL_ADDRESS
    '', // SAON_START_NUMBER
    '', // SAON_START_NUMBER_SUFFIX
    '', // SAON_END_NUMBER
    '', // SAON_END_NUMBER_SUFFIX
    '', // SAON_DESCRIPTION
    '1', // PAON_START_NUMBER
    '', // PAON_START_NUMBER_SUFFIX
    '', // PAON_END_NUMBER
    '', // PAON_END_NUMBER_SUFFIX
    '', // PAON_DESCRIPTION
    row.street, // STREET
    row.town, // TOWN
    row.locality, // LOCALITY
    'ENGLAND', // UK_INTERNAL_CODE
    row.postcode, // POSTCODE
    'GB', // COUNTRY_CODE
    'Y', // PREFERRED_CONTACT_METHOD_IND
    row.udprn, // UDPRN
    row.cph // CPHS
  ].join('|')
}

setup(
  'ingest CTS and SAM datasets and execute Cleanse rules engine run',
  async ({ etlClient, apiClient, cleanseClient }) => {
    setup.setTimeout(180000)

    // Read baseline SAM holdings and append Cleanse Rule 1 test scenarios in memory
    // matching active English CPHs from CTSM_CADS_PROD_BULK_00001_001_CT_LOCATION_IDENTIFIERS_BASELINE.csv
    const holdingFilePath = path.resolve(
      'tests/data/LITP_SAMCPHHOLDING_BASELINE.csv'
    )
    const holdingRaw = fs.readFileSync(holdingFilePath, 'utf8')
    const batchId = String(Math.floor(Date.now() / 1000))

    const cleanseHoldingRows = [
      // Rule 1 Positive #1: SAM holding has non-cattle species (SHP) -> Flagged with errorCode 01
      buildSamHoldingRow(
        {
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
        },
        batchId
      ),
      // Rule 1 Positive #2: SAM holding has no animal species code -> Flagged with errorCode 01
      buildSamHoldingRow(
        {
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
        },
        batchId
      ),
      // Rule 1 Negative #1 & Rule 3 Negative (AC02): SAM holding has Cattle (CTT) and 'Land At Farm 4' matching CTS 'FARM 4' after normalisation -> NOT flagged by Rule 1 or Rule 3
      buildSamHoldingRow(
        {
          cph: '32/199/9001',
          featureName: 'Land At Farm 4',
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
        },
        batchId
      ),
      // Rule 1 Negative #2 & Rule 3 Positive #1 (AC01 Placeholder): SAM holding has Bison (BSN) and placeholder name 'Not Known' while PAON holds 'FARM 5' -> Flagged by Rule 3 (placeholder)
      buildSamHoldingRow(
        {
          cph: '40/139/0012',
          featureName: 'Not Known',
          companyName: 'Cleanse Holdings 5',
          addressPk: '25900005',
          paonDescription: 'FARM 5',
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
        },
        batchId
      ),
      // Rule 1 Negative #3 & Rule 3 Positive #2 (AC01 Inconsistent Name): SAM holding has Buffalo (BFF) and 'Oakwood Grange' vs CTS 'FARM 7' -> Flagged by Rule 3 (different)
      buildSamHoldingRow(
        {
          cph: '28/166/7000',
          featureName: 'Oakwood Grange',
          companyName: 'Cleanse Holdings 7',
          addressPk: '25900007',
          paonDescription: 'Oakwood Grange',
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
        },
        batchId
      )
    ]

    const combinedHoldingContent = `${holdingRaw.trimEnd()}\n${cleanseHoldingRows.join('\n')}\n`

    // Purge all SAM and CTS datasets from external storage so cleanse-setup is self-contained
    const cleanseDatasets = [
      'sam_cph_holdings',
      'sam_cph_holder',
      'sam_party',
      'sam_herd',
      'cts_location_identifiers',
      'cts_locations',
      'cts_addresses',
      'cts_counties',
      'cts_parties',
      'cts_location_party_rels'
    ]
    for (const dataset of cleanseDatasets) {
      await etlClient.purgeStorage({
        dataset,
        stage: 'all',
        sourceType: 'external'
      })
    }

    // Upload SAM baseline datasets (with in-memory Cleanse holding rows)
    await etlClient.uploadFile(
      'LITP_SAMCPHHOLDING_BASELINE.csv',
      undefined,
      combinedHoldingContent
    )

    // Append Cleanse Rule 10 holder rows in memory for correspondence address comparison
    const holderFilePath = path.resolve(
      'tests/data/LITP_SAMCPHHOLDER_BASELINE.csv'
    )
    const holderRaw = fs.readFileSync(holderFilePath, 'utf8')
    const cleanseHolderRows = [
      // Rule 10 Positive: 32/199/9001 holder postcode 'EC1A 1BB' differs from CTS 'SW1A 1AA'
      buildSamHolderRow({
        partyId: 'C9900001',
        familyName: 'HolderMismatch',
        orgName: 'Cleanse Org 4',
        street: '10 Fleet Street',
        town: 'London',
        locality: 'City',
        postcode: 'EC1A 1BB',
        udprn: '25990001',
        cph: '32/199/9001'
      }),
      // Rule 10 Negative #1: 40/139/0012 holder postcode 'sw1a1aa' matches CTS 'SW1A 1AA' after normalisation
      buildSamHolderRow({
        partyId: 'C9900002',
        familyName: 'HolderMatch',
        orgName: 'Cleanse Org 5',
        street: 'Farm Lane',
        town: 'Test Town',
        locality: 'Valeshire',
        postcode: 'sw1a1aa',
        udprn: '25990002',
        cph: '40/139/0012'
      }),
      // Rule 10 Negative #2: 28/166/7000 has two holders; one differs ('M1 1AE') and one matches ('SW1A 1AA') -> silent
      buildSamHolderRow({
        partyId: 'C9900003',
        familyName: 'HolderMultiDiff',
        orgName: 'Cleanse Org 7A',
        street: '1 Oxford Road',
        town: 'Manchester',
        locality: 'Lancashire',
        postcode: 'M1 1AE',
        udprn: '25990003',
        cph: '28/166/7000'
      }),
      buildSamHolderRow({
        partyId: 'C9900004',
        familyName: 'HolderMultiMatch',
        orgName: 'Cleanse Org 7B',
        street: 'Farm Lane',
        town: 'Test Town',
        locality: 'Oakshire',
        postcode: 'SW1A 1AA',
        udprn: '25990004',
        cph: '28/166/7000'
      })
    ]
    const combinedHolderContent = `${holderRaw.trimEnd()}\n${cleanseHolderRows.join('\n')}\n`

    await etlClient.uploadFile(
      'LITP_SAMCPHHOLDER_BASELINE.csv',
      undefined,
      combinedHolderContent
    )
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

    // Refresh KRDS API SQLite cache so krds-api tests see the latest snapshot if run after cleanse-setup
    await apiClient.refreshSqliteCache('all', false)

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
