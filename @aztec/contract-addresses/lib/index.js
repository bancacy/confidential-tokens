"use strict";

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var _require = require('lodash'),
    isUndefined = _require.isUndefined;

var rinkebyAddresses = require('../addresses/rinkeby');

var ropstenAddresses = require('../addresses/ropsten');

var NetworkId = {
  Mainnet: '1',
  Ropsten: '3',
  Rinkeby: '4',
  Ganache: '1234'
};
var networkToAddresses = {
  '3': _objectSpread({}, ropstenAddresses),
  '4': _objectSpread({}, rinkebyAddresses)
};
/**
 * Used to get addresses of contracts that have been deployed to either the
 * Ethereum mainnet or a supported testnet. Throws if there are no known
 * contracts deployed on the corresponding network.
 * @param networkId The desired networkId.
 * @returns The set of addresses for contracts which have been deployed on the
 * given networkId.
 */

var getContractAddressesForNetwork = function getContractAddressesForNetwork(networkId) {
  if (isUndefined(networkToAddresses[networkId])) {
    throw new Error("Unknown network id (".concat(networkId, "). No known AZTEC contracts have been deployed on this network."));
  }

  return networkToAddresses[networkId];
};

module.exports = {
  getContractAddressesForNetwork: getContractAddressesForNetwork,
  NetworkId: NetworkId
};