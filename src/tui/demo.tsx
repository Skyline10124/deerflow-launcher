import React from 'react'
import { render } from 'ink'
import DemoDashboard from './screens/DemoDashboard.js'

const { waitUntilExit } = render(React.createElement(DemoDashboard))

waitUntilExit().then(() => {
  process.exit(0)
})
