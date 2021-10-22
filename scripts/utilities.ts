import { BigNumber } from "ethers";
import { task } from "hardhat/config"

const ADDRESSES = require("../common/addresses")
const IDLE_TOKEN_ABI = require("../abi/IdleTokenGovernance.json")
const ILENDING_PROTOCOL_ABI = require("../abi/ILendingProtocol.json")
const ERC20_ABI = require("../abi/ERC20.json")
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("flash-liquidity", "fetch flash loan liquidity", async(_, hre) => {
  const isPolygon = hre.network.name == 'matic';
  const idleTokens = isPolygon ? ADDRESSES.allIdleTokensBestMatic : ADDRESSES.allIdleTokensBest;
  const one = toBN("10").pow("18");
  const debug = true;

  for (let i = 0; i < idleTokens.length; i++) {
    const idleAddr = idleTokens[i];
    const idleToken = await hre.ethers.getContractAt(IDLE_TOKEN_ABI, idleAddr);
    const address = await idleToken.token();
    const underlying = await hre.ethers.getContractAt(ERC20_ABI, address);
    const name = await underlying.name();
    const decimals = await underlying.decimals();
    const oneToken = toBN("10").pow(decimals);
    const tvl = await idleToken.maxFlashLoan(address);
    console.log(`📝 Fetching data for ${await idleToken.name()} (TVL: ${tvl.div(oneToken)})`);
    
    // contract balance
    let flashLiquidity = toBN(await underlying.balanceOf(idleAddr));
    if (debug) {
      console.log(`Underlying [${name}] balance: ${flashLiquidity.div(oneToken)}`);
    }
    const availableTokens = await idleToken.getAllAvailableTokens();
    for (let j = 0; j < availableTokens.length; j++) {
      const availableToken = availableTokens[j];
      const protocolToken = await hre.ethers.getContractAt(ERC20_ABI, availableToken);
      const currProtocolWrapper = await idleToken.protocolWrappers(availableToken);
      const wrapper = await hre.ethers.getContractAt(ILENDING_PROTOCOL_ABI, currProtocolWrapper);
      
      const protocolTokenBal = await protocolToken.balanceOf(idleAddr);
      const protocolTokenPrice = await wrapper.getPriceInToken();
      const idleProtocolTVL = toBN(protocolTokenBal).mul(toBN(protocolTokenPrice)).div(one);
      
      let protocolLiquidity = await wrapper.availableLiquidity();
      // remove 1% to be sure it's really available (eg for compound-like protocols)
      protocolLiquidity = toBN(protocolLiquidity).mul(toBN('99')).div(toBN('100'));
      if (debug) {
        console.log(`${await protocolToken.symbol()} liquidity: ${protocolLiquidity.div(oneToken)} (deposited: ${idleProtocolTVL.div(oneToken)})`);
      }
      flashLiquidity = flashLiquidity.add(protocolLiquidity.gt(idleProtocolTVL) ? idleProtocolTVL : protocolLiquidity);
    }
    if (flashLiquidity.gt(tvl)) {
      flashLiquidity = tvl;
    }

    console.log(`|_ Flashable liquidity: ${flashLiquidity.div(oneToken)} ${name}`);
  }
})
