import { definePipelineTestSuite } from '../fixtures/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'cts_location_identifiers',
  displayName: 'CTS Location Identifiers',
  primaryKey: 'LID_ID',
  baselineFile:
    'CTSM_CADS_PROD_BULK_00001_001_CT_LOCATION_IDENTIFIERS_BASELINE.csv',
  baselineFolder: 'cads/cts/bulk',
  delta1File:
    'CTSM_CADS_PROD_DELTA_00001_001_CT_LOCATION_IDENTIFIERS_DELTA_1.csv',
  delta1Folder: 'cads/cts/daily',
  delta2File:
    'CTSM_CADS_PROD_DELTA_00002_001_CT_LOCATION_IDENTIFIERS_DELTA_2.csv',
  delta2Folder: 'cads/cts/daily',
  xsvnDeltaFile:
    'CTSM_CADS_PROD_DELTA_00003_001_CT_LOCATION_IDENTIFIERS_DELTA_3.xsvn.csv',
  xsvnDeltaFolder: 'cads/cts/daily'
})
