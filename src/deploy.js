const fs = require('fs');
const path = require("path");
const secp256k1 = require('@aztec/secp256k1');
const { getContractAddressesForNetwork, NetworkId } = require("@aztec/contract-addresses");
const { constants: { ERC20_SCALING_FACTOR } } = require("@aztec/dev-utils");

const web3 = require('./web3Provider');
const { sendTx } = require('./tx.js');
const ZkAsset = require('../build/contracts/ZkAsset.json');

const accounts = require(path.join(__dirname, 'accounts'));

const account = secp256k1.accountFromPrivateKey(accounts[0].privateKey);
const aztecAddresses = getContractAddressesForNetwork(NetworkId.Rinkeby);
const aceAddress = aztecAddresses.ACE;
const erc20Address = aztecAddresses.ERC20Mintable;
const canMintAndBurn = false;
const canConvert = true;


async function deploy() {
    const deployData = new web3.eth.Contract(ZkAsset.abi)
    .deploy(
        { 
            data: ZkAsset.bytecode,
            arguments: [
                aceAddress,
                erc20Address,
                ERC20_SCALING_FACTOR.toString(10),
                canMintAndBurn,
                canConvert,
            ],
        }
    )
    .encodeABI();
    const result = await sendTx({
        from: account.address,
        data: deployData,
        privateKey: account.privateKey
    });
    console.log('result = ', result);
    return result;
}

return deploy().then((res) => {
    const confidentialTokenAddress = res.contractAddress;
    fs.writeFileSync('zkAsset.json', JSON.stringify({ confidentialTokenAddress }));
    console.log('deployed zkAsset');
});