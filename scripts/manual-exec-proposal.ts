import { task } from "hardhat/config"

const addresses = require("../common/addresses")

const GOVERNOR_ABI = require("../abi/GovernorAlpha.json")
import { BigNumber } from "ethers";
const toBN = function(v: any): BigNumber { return BigNumber.from(v.toString()) };

export default task("manual-exec-proposal", "Generic iip to upgrade Idle tokens")
  // .addParam("proposalNumber", null, false, types.number, true)
  // .addParam("blocks", null, false, types.number, true)
  .setAction(async(args, hre) => {

  // arguments
  const proposalNumber = args.proposalNumber;
  const blocks = args.blocks || 5500;

  if (!proposalNumber) {
    console.log('Proposal number is requires');
    return;
  }

  const gov = await hre.ethers.getContractAt(GOVERNOR_ABI, '0x2256b25CFC8E35c3135664FD03E77595042fe31B');
  const waitBlocks = async (n: number) => {
    console.log(`mining ${n} blocks...`);
    for (var i = 0; i < n; i++) {
      await hre.ethers.provider.send("evm_mine", []);
    };
  }
  const voter = addresses.devLeagueMultisig;
  await hre.network.provider.send("hardhat_impersonateAccount", [voter])
  await hre.network.provider.send("hardhat_setBalance", [voter, "0xffffffffffffffff"])
  let voterSigner = await hre.ethers.getSigner(voter)

  await gov.connect(voterSigner).castVote(proposalNumber, true);
  await waitBlocks(blocks);
  await gov.queue(proposalNumber);
  console.log('queued');
  const block = await hre.ethers.provider.getBlock('latest');
  // console.log({blocknumber: block.number, timestamp: block.timestamp})
  // 172800 -> is the 2 days timelock period
  await hre.ethers.provider.send("evm_increaseTime", [172801]);
  await hre.ethers.provider.send("evm_mine", []);
  const block2 = await hre.ethers.provider.getBlock('latest');
  // console.log({blocknumber: block2.number, timestamp: block2.timestamp})

  const state = await gov.state(proposalNumber)
  const prop = await gov.proposals(proposalNumber)
  console.log('State: ', state, 'End block', prop.endBlock.toString());
  await gov.execute(proposalNumber);
  console.log('executed');
});
