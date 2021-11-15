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
import "./scripts/iip-upgrade"
import "./scripts/utilities"
import "./scripts/test-idle-token"
import "./scripts/example-upgrade"
import "./scripts/execute-proposal-or-simulate"
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
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        // blockNumber: 12725152, // iip-11
        // blockNumber: 13235728, // iip-12
        // blockNumber: 13334600, // iip-13
        // blockNumber: 13372333, // iip-14
        // blockNumber: 13543217, // iip-15
        blockNumber: 13587540, // iip-16

        // url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
        // url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
        // blockNumber:  20708483,
      },
      // chainId: 137,
      // chainId: 1
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
    governor: "0x2256b25CFC8E35c3135664FD03E77595042fe31B",
    votingToken: "0x875773784Af8135eA0ef43b5a374AaD105c5D39e"
  }
}

export default config;
