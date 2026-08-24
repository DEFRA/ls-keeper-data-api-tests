import { definePipelineTestSuite } from '../fixtures/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'sam_cph_holder',
  displayName: 'SAM CPH Holder',
  primaryKey: 'PARTY_ID',
  baselineFile: 'LITP_SAMCPHHOLDER_BASELINE.csv',
  delta1File: 'LITP_SAMCPHHOLDER_DELTA_1.csv',
  delta2File: 'LITP_SAMCPHHOLDER_DELTA_2.csv'
})
