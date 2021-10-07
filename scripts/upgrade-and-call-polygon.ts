import { BigNumber } from "ethers";
import { task } from "hardhat/config"
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import {SafeEthersSigner, SafeService} from "@gnosis.pm/safe-ethers-adapters"
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")

const addrs = require("../common/addresses");
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

    const newImplementationAddr = "0x26F1Ac97dEfFF4fce24408C717e9C7D3754EFB6b";
    const proxyAdminAddress = "0xCF8977156cc60a5c9bF32d44C143A60CDe6341c3";
    let proxyAdmin = await hre.ethers.getContractAt((await hre.artifacts.readArtifact("IProxyAdmin")).abi, proxyAdminAddress);
    proxyAdmin = proxyAdmin.connect(signer);

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
