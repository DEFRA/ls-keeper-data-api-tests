import { definePipelineTestSuite } from '../fixtures/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'sam_herd',
  displayName: 'SAM Herd',
  primaryKey: 'HERDMARK',
  baselineFile: 'LITP_SAMHERD_BASELINE.csv',
  delta1File: 'LITP_SAMHERD_DELTA_1.csv',
  delta2File: 'LITP_SAMHERD_DELTA_2.csv'
})
