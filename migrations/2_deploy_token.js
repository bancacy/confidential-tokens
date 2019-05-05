/* global artifacts */
const { getContractAddressesForNetwork, NetworkId } = require("@aztec/contract-addresses");
const { constants: { ERC20_SCALING_FACTOR } } = require("@aztec/dev-utils");

const ZKERC20 = artifacts.require("./ZKERC20.sol");

module.exports = (deployer) => {
  // Cannot deploy locally because we need the ACE and the ERC20Mintable
  // If you want to do that, go to https://github.com/AztecProtocol/AZTEC/tree/master/packages/protocol
  if (![NetworkId.Kovan, NetworkId.Rinkeby, NetworkId.Ropsten].includes(deployer.network_id)) {
    return true;
  }
  const aztecAddresses = getContractAddressesForNetwork(deployer.network_id);
  const aceAddress = aztecAddresses.ace;
  const erc20Address = aztecAddresses.erc20Mintable;

  // Cocoa beans were used as money by Aztec people
  // const name = "Cocoa";
  
  // We're pairing the confidential token with an ERC20, so we cannot mint or burn within this contract
  const canMintAndBurn = false;
  const canConvert = true;

  return deployer.deploy(
    ZKERC20,
    aceAddress
    erc20Address,
    ERC20_SCALING_FACTOR.toString(10),
    canConvert,
    canMintAndBurn,
  );
};
