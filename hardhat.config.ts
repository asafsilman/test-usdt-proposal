import { HardhatUserConfig } from "hardhat/config"
import "@nomiclabs/hardhat-waffle"
import "@idle-finance/hardhat-proposals-plugin"

require('dotenv').config()

import "./scripts/iip-11"
import "./scripts/iip-12"
import "./scripts/iip-13"
import "./scripts/iip-upgrade"
import "./scripts/test-idle-token"
import "./scripts/example-upgrade"

const config: HardhatUserConfig = {
  solidity: "0.5.16",
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        // blockNumber: 12725152, // iip-11
        // blockNumber: 13235728, // iip-12
        blockNumber: 13287820, // iip-13
      },
      chainId: 1
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      gasPrice: 'auto',
      gas: 'auto',
      timeout: 1200000
    },
    local: {
      url: "http://127.0.0.1:8545/",
      timeout: 1200000,
    }
  },
  proposals: {
    governor: "0x2256b25CFC8E35c3135664FD03E77595042fe31B",
    votingToken: "0x875773784Af8135eA0ef43b5a374AaD105c5D39e"
  }
}

export default config;
