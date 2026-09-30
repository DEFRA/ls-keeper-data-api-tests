import { definePipelineTestSuite } from '../../helpers/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'cts_parties',
  displayName: 'CTS Parties',
  primaryKey: 'PAR_ID',
  baselineFile: 'CTSM_CADS_PROD_BULK_00001_001_CT_PARTIES_BASELINE.csv',
  baselineFolder: 'cads/cts/bulk',
  delta1File: 'CTSM_CADS_PROD_DELTA_00001_001_CT_PARTIES_DELTA_1.csv',
  delta1Folder: 'cads/cts/daily',
  delta2File: 'CTSM_CADS_PROD_DELTA_00002_001_CT_PARTIES_DELTA_2.csv',
  delta2Folder: 'cads/cts/daily'
})
