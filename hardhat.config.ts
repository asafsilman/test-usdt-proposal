import { HardhatUserConfig } from "hardhat/config"
import "@nomiclabs/hardhat-waffle"
import "@idle-finance/hardhat-proposals-plugin"

require('dotenv').config()

import "./scripts/iip-11"
import "./scripts/iip-12"
import "./scripts/iip-13"
import "./scripts/iip-14"
import "./scripts/iip-15"
import "./scripts/iip-16"
import "./scripts/iip-17"
import "./scripts/iip-18"
import "./scripts/iip-19"
import "./scripts/iip-20"
import "./scripts/iip-upgrade"
import "./scripts/utilities"
import "./scripts/test-idle-token"
import "./scripts/example-upgrade"
import "./scripts/execute-proposal-or-simulate"
import "./scripts/manual-exec-proposal"
import "./scripts/polygon/upgrade-and-call-polygon"
import "./scripts/polygon/transfer-ownership-polygon"

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 25
          }
        }
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ],
  },
  networks: {
    hardhat: {
      forking: {
        // Ethereum
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: 14474950 // iip-20
        // blockNumber: 14386195 // iip-19
        // blockNumber: 13753067 // iip-18
        // blockNumber: 13665047, // iip-17
        // blockNumber: 13587540, // iip-16
        // blockNumber: 13543217, // iip-15
        // blockNumber: 13372333, // iip-14
        // blockNumber: 13334600, // iip-13
        // blockNumber: 13235728, // iip-12
        // blockNumber: 12725152, // iip-11

        // Polygon
        // url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
        // url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
        // blockNumber: 24236280,
      },
      // timeout: 10000000
      // allowUnlimitedContractSize: true
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      gasPrice: 'auto',
      gas: 'auto',
      timeout: 1200000
    },
    matic: {
      // url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      gasPrice: 'auto',
      gas: 'auto',
      timeout: 1200000,
      chainId: 137
    }
  },
  proposals: {
    governor: "0x3D5Fc645320be0A085A32885F078F7121e5E5375",
    votingToken: "0x875773784Af8135eA0ef43b5a374AaD105c5D39e"
  }
}

export default config;
