require("dotenv").config();

const Web3 = require('web3');

// const HDWalletProvider = require("truffle-hdwallet-provider");


const createProvider = (network) => {
  if (!process.env.MNEMONIC) {
    console.log("Please set your MNEMONIC in a .env file first");
    process.exit(1);
  }
  if (!process.env.INFURA_API_KEY) {
    console.log("Please set your INFURA_API_KEY in a .env file first");
    process.exit(1);
  }
  return () => {
      return new Web3.providers.HttpProvider(`https://${network}.infura.io/v3/` + process.env.INFURA_API_KEY);
    // return new HDWalletProvider(
    //   process.env.MNEMONIC,
    //   `https://${network}.infura.io/v3/` + process.env.INFURA_API_KEY
    // );
  };
};

module.exports = {
  compilers: {
    solc: {
      version: "0.5.8",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: 'petersburg',
      },
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
