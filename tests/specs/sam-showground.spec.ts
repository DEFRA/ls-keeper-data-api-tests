import { definePipelineTestSuite } from '../fixtures/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'sam_showground',
  displayName: 'SAM Showground',
  primaryKey: 'CPH',
  baselineFile: 'LITP_SAMSHOWGROUND_BASELINE.csv',
  delta1File: 'LITP_SAMSHOWGROUND_DELTA_1.csv',
  delta2File: 'LITP_SAMSHOWGROUND_DELTA_2.csv'
})
