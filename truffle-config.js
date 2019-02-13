require("dotenv").config();

const HDWalletProvider = require("truffle-hdwallet-provider");

const createProvider = (network) => {
  return () => {
    return new HDWalletProvider(
      process.env.MNEMONIC,
      `https://${network}.infura.io/v3/` + process.env.INFURA_API_KEY
    );
  };
};

module.exports = {
  compilers: {
    solc: {
      version: "0.4.24",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  networks: {
    development: {
      host: "127.0.0.1",
      network_id: "*",
      port: 8545,
    },
    kovan: {
      provider: createProvider("kovan"),
      gas: 6000000,
      network_id: 42, // eslint-disable-line camelcase
      skipDryRun: true, // if you don't want to test run the migration locally before the actual migration (default is false)
    },
    rinkeby: {
      provider: createProvider("rinkeby"),
      gas: 6000000,
      network_id: 4, // eslint-disable-line camelcase
      skipDryRun: true, // if you don't want to test run the migration locally before the actual migration (default is false)
    }
  },
};
