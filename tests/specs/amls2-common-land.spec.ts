import { definePipelineTestSuite } from '../fixtures/pipeline-test-suite.factory.js'

definePipelineTestSuite({
  dataset: 'amls2_common_land',
  displayName: 'AMLS2 Common Land',
  primaryKey: 'COMMON_LAND_PREMISE_ID',
  baselineFile: 'LITP_AMLS2COMMONLAND_BASELINE.csv',
  delta1File: 'LITP_AMLS2COMMONLAND_DELTA_1.csv',
  delta2File: 'LITP_AMLS2COMMONLAND_DELTA_2.csv'
})
