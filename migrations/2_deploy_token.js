/* global artifacts */
const { getContractAddressesForNetwork, NetworkId } = require("@aztec/contract-addresses");
const { constants: { ERC20_SCALING_FACTOR } } = require("@aztec/dev-utils");

const ZKERC20 = artifacts.require("./ZKERC20.sol");

module.exports = (deployer) => {
  if (![NetworkId.Kovan, NetworkId.Rinkeby, NetworkId.Ropsten].includes(deployer.network_id)) {
    return true;
  }
  const aztecAddresses = getContractAddressesForNetwork(deployer.network_id);
  const aceAddress = aztecAddresses.ace;
  const erc20Address = aztecAddresses.erc20Mintable;

  // cocoa beans were used as money by Aztec people
  const name = "Cocoa";
  
  // we're pairing the confidential token with an ERC20, so we cannot mint or burn within this contract
  const canMint = false;
  const canBurn = false;
  const canConvert = true;

  return deployer.deploy(
    ZKERC20,
    name,
    canMint,
    canBurn,
    canConvert,
    ERC20_SCALING_FACTOR.toString(10),
    erc20Address,
    aceAddress
  );
};
