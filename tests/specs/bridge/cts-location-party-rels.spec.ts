import { definePipelineTestSuite } from '../../helpers/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'cts_location_party_rels',
  displayName: 'CTS Location Party Rels',
  primaryKey: 'LPR_ID',
  baselineFile:
    'CTSM_CADS_PROD_BULK_00001_001_CT_LOCATION_PARTY_RELS_BASELINE.csv',
  baselineFolder: 'cads/cts/bulk',
  delta1File:
    'CTSM_CADS_PROD_DELTA_00001_001_CT_LOCATION_PARTY_RELS_DELTA_1.csv',
  delta1Folder: 'cads/cts/daily',
  delta2File:
    'CTSM_CADS_PROD_DELTA_00002_001_CT_LOCATION_PARTY_RELS_DELTA_2.csv',
  delta2Folder: 'cads/cts/daily'
})
