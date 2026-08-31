import { definePipelineTestSuite } from '../fixtures/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'sam_cph_holdings',
  displayName: 'SAM CPH Holdings',
  primaryKey: 'CPH',
  baselineFile: 'LITP_SAMCPHHOLDING_BASELINE.csv',
  delta1File: 'LITP_SAMCPHHOLDING_DELTA_1.csv',
  delta2File: 'LITP_SAMCPHHOLDING_DELTA_2.csv'
})
