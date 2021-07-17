import { task } from "hardhat/config"
import { AbiCoder } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";

const addresses = require("./addresses")

const deployWrapperProxy = async (
    proxyFactory: Contract,
    implementationAddress: string,
    tokenAddress: string,
    idleTokenAddress: string,
    ownerAddress: string,
    from: string) => {
    const initSig = "initialize(address,address,address)";
    const abiCoder = new AbiCoder()
    const initData = abiCoder.encode(
        ['address', 'address', 'address'],
        [tokenAddress, idleTokenAddress, ownerAddress]
    )
    // const initData = web3.eth.abi.encodeParameters(
    //     ["address", "address", "address"],
    //     [tokenAddress, idleTokenAddress, ownerAddress]
    // );

    console.log("initSig", initSig);
    console.log("initData", initData);

    const result = await proxyFactory.createAndCall(implementationAddress, initSig, initData, { from: from });
    const receipt = await result.wait()
    const wrapperAddress = receipt.events[receipt.events.length-1].args.proxy;
    return wrapperAddress;
}

export default task("simulate-proposal", "Simulate the proposal", async(_, hre) => {
    // SETUP
    const network = 'mainnet' // for testing purposes

    const IDLE_WHALE = "0xe8eA8bAE250028a8709A3841E0Ae1a44820d677b"
    const DEPLOYER = hre.waffle.provider.getWallets()[0]
  
    await hre.network.provider.send("hardhat_impersonateAccount", [IDLE_WHALE])
    await hre.network.provider.send("hardhat_setBalance", [IDLE_WHALE, "0xffffffffffffffff"])

    const proxyFactory = await hre.ethers.getContractAt(
        "MinimalInitializableProxyFactory",
        addresses.minimalInitializableProxyFactory[network]
    )

    const IdleCompoundLikeImplementation = await hre.ethers.getContractFactory("IdleCompoundLike")
    const idleCompoundLikeImplementation = await IdleCompoundLikeImplementation.deploy()

    const idleUSTDv4 = await hre.ethers.getContractAt(
        require("../abi/IdleTokenGovernance.json"),
        addresses.idleUSDTV4
    )

    console.log(`Deployed implementation to ${idleCompoundLikeImplementation.address}`)

    const crUSDT = addresses.crUSDT[network]

    const usdtCREAMWrapper = await deployWrapperProxy(
        proxyFactory,
        idleCompoundLikeImplementation.address,
        crUSDT,
        idleUSTDv4.address,
        idleUSTDv4.address,
        DEPLOYER.address
    )

    console.log(`Deployed usdtCREAMWrapper to ${usdtCREAMWrapper}`)

    let protocolTokens = [...(await idleUSTDv4.getAPRs())["0"]];
    let protocolGovTokens = []
    let allGovTokens = []
    let wrappers = [];

    for (var j = 0; j < protocolTokens.length; j++) {
        const token = protocolTokens[j];
        const wrapper = await idleUSTDv4.protocolWrappers(token);
        const govToken = await idleUSTDv4.getProtocolTokenToGov(token)

        if (govToken !== addresses.addr0) {
            allGovTokens.push(govToken)
        }

        wrappers.push(wrapper);
        protocolGovTokens.push(govToken)
    };

    console.log("protocol tokens:", protocolTokens);
    console.log("protocol gov tokens:", protocolGovTokens)
    console.log("wrappers:", wrappers)

    protocolTokens.push(crUSDT)
    protocolGovTokens.push(addresses.CREAM[network])
    wrappers.push(usdtCREAMWrapper)
    
    let proposer = await hre.ethers.getSigner(IDLE_WHALE)
  
    let builder = await hre.proposal.builders.alpha()
    builder = builder.setProposer(proposer)
        .addAction(idleUSTDv4, "setAllAvailableTokensAndWrappers", [
          protocolTokens,
          wrappers,
          allGovTokens,
          protocolGovTokens
        ])
        .setDescription("[TEST] Enable CREAM for idleUSDT")
  
    let proposal = builder.build()

    console.log("Proposal Info")
    await proposal.printProposalInfo()
    await proposal.simulate()
    console.log("Simulated proposal...")

  })