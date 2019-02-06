/* global artifacts */
const ERC20Mintable = artifacts.require("./ERC20Mintable.sol");
const ConfidentialToken = artifacts.require("./ConfidentialToken.sol");

const { getContractAddressesForNetwork, NetworkId } = require("@aztec/contract-addresses");
const { constants: { ERC20_SCALING_FACTOR } } = require("@aztec/dev-utils");

const aceAddress = getContractAddressesForNetwork(NetworkId.Rinkeby).ace;

module.exports = (deployer) => {
  // cocoa beans were used as money by Aztec people
  const name = "Cocoa";
  const canMint = true;
  const canBurn = true;
  const canConvert = true;

  return deployer.deploy(ERC20Mintable).then(({ address: erc20Address}) => {
    return deployer.deploy(
      ConfidentialToken,
      name,
      canMint,
      canBurn,
      canConvert,
      ERC20_SCALING_FACTOR,
      erc20Address,
      aceAddress
    );
  });
};
