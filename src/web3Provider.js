const Web3 = require("web3");

const provider = new Web3.providers.WebsocketProvider('wss://rinkeby.infura.io/ws');

const web3 = new Web3(provider);

module.exports = web3;
