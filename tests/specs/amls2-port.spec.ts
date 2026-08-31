import { definePipelineTestSuite } from '../fixtures/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'amls2_port',
  displayName: 'AMLS2 Port',
  primaryKey: 'CPH',
  baselineFile: 'LITP_AMLS2PORT_BASELINE.csv',
  delta1File: 'LITP_AMLS2PORT_DELTA_1.csv',
  delta2File: 'LITP_AMLS2PORT_DELTA_2.csv'
})
