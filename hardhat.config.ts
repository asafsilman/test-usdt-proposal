import { HardhatUserConfig } from "hardhat/config"
import "@nomiclabs/hardhat-waffle"
import "@idle-finance/hardhat-proposals-plugin"

require('dotenv').config()


// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

import "./scripts/deploy-contracts"
import "./scripts/simulate-proposal"
import "./scripts/test-proposal"

import "./scripts/IIP-11-Disable-AAVE-v1"

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  solidity: "0.5.16",
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 12725152,
      }
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      gasPrice: 'auto',
      gas: 'auto',
      timeout: 120000
    }
  },
  proposals: {
    governor: "0x2256b25CFC8E35c3135664FD03E77595042fe31B",
    votingToken: "0x875773784Af8135eA0ef43b5a374AaD105c5D39e"
  }
}

export default config;
