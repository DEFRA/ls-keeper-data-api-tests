import { definePipelineTestSuite } from '../fixtures/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'sam_party',
  displayName: 'SAM Party',
  primaryKey: 'PARTY_ID',
  baselineFile: 'LITP_SAMPARTY_BASELINE.csv',
  delta1File: 'LITP_SAMPARTY_DELTA_1.csv',
  delta2File: 'LITP_SAMPARTY_DELTA_2.csv'
})
