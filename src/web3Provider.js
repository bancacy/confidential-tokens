const Web3 = require("web3");

const url = `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

module.exports = web3;
