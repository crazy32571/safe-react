import React from 'react'

import WalletInfo from './index'

export default {
  title: 'NavBar/WalletInfo',
  component: WalletInfo,
}

export const SimpleLayout = (): React.ReactElement => (
  <WalletInfo address="0xEE63624cC4Dd2355B16b35eFaadF3F7450A9438B" safeName="SomeName" balance="$111,111" />
)
