import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"
const IDLE_TOKEN_ABI = require("../../abi/IdleTokenGovernance.json")

const addrs = require("../../common/addresses");
const addr0 = addrs.addr0;
// const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("upgrade-and-call-polygon", "Deploy IIP 11 to Disable AAVE v1", async(_, hre) => {
    const isLocalNet = hre.network.name == 'hardhat';
    let signer;
    if (isLocalNet) {
      await hre.network.provider.send("hardhat_impersonateAccount", [addrs.polygonDev])
      signer = await hre.ethers.getSigner(addrs.polygonDev)
      await hre.network.provider.send("hardhat_setBalance", [addrs.polygonDev, "0xffffffffffffffff"])
    } else {
      signer = new LedgerSigner(hre.ethers.provider, undefined, "m/44'/60'/0'/0/0");
      // const service = new SafeService('https://safe-transaction.gnosis.io/')
      // signer = await SafeEthersSigner.create(ADDRESSES.devLeagueMultisig, signer, service, hre.ethers.provider)
    }

    const idleTokensPoly = [
      addrs.maticIdleDAIV4, addrs.maticIdleUSDCV4, addrs.maticIdleWETHV4
    ];

    const newImplementationAddr = "0xC10b35fE63ab37c42b2A812b9dcd1b071627647b";
    const proxyAdminAddress = "0xCF8977156cc60a5c9bF32d44C143A60CDe6341c3";
    let proxyAdmin = await hre.ethers.getContractAt((await hre.artifacts.readArtifact("IProxyAdmin")).abi, proxyAdminAddress);
    proxyAdmin = proxyAdmin.connect(signer);

    // const oracleAddress = '0x12271d4Ba175F20Dd673218E780426158D0b0f07';
    // const proxyAdminOracleAddress = "0x6F15DcBf4FB727eD77d85943F0e59ce4617aBCCf";
    // let proxyAdminOracle = await hre.ethers.getContractAt((await hre.artifacts.readArtifact("IProxyAdmin")).abi, proxyAdminOracleAddress);
    // proxyAdminOracle = proxyAdminOracle.connect(signer);
    // await proxyAdminOracle.changeProxyAdmin(oracleAddress, proxyAdminAddress);
    // console.log(await proxyAdmin.getProxyAdmin(oracleAddress))
    // console.log(await proxyAdmin.getProxyImplementation(oracleAddress))

    const abi = [`function _init()`];
    const iface = new hre.ethers.utils.Interface(abi);
    const initMethodCall = iface.encodeFunctionData("_init", []);

    for (let i = 0; i < idleTokensPoly.length; i++) {
      let idleTokenAddr = idleTokensPoly[i];
      let idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, idleTokenAddr);
      idleToken = idleToken.connect(signer);
      console.log('upgradeAndCall for ', idleTokenAddr);

      console.log('oracle pre', await idleToken.oracle());
      await proxyAdmin.upgradeAndCall(idleTokenAddr, newImplementationAddr, initMethodCall);
      console.log('oracle post', await idleToken.oracle());
      console.log((await idleToken.flashLoanFee()).toString());
    }

    // Skip tests in mainnet
    if (!isLocalNet) {
      return;
    }
})
