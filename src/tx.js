const Tx = require("ethereumjs-tx");

const web3 = require("./web3Provider");

const sendTx = async ({ from, to, data, privateKey }) => {
    const nonce = await web3.eth.getTransactionCount(from, "pending");
    const gasLimit = "0x47B760"; // 4,700,000
    const gasPrice = "0x12A05F200"; // 5,000,000,000
    const chainId = web3.utils.toHex(await web3.eth.net.getId());
    const tx = new Tx({
        nonce: nonce,
        from: from,
        to: to,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
        data: data,
        chainId: chainId
    });
    tx.sign(Buffer.from(privateKey.slice(2), "hex"));
    const serializedTx = tx.serialize().toString("hex");
    console.log('sending a signed transaction...');
    return new Promise((resolve, reject) => {
        web3.eth.sendSignedTransaction("0x" + serializedTx)
        .once('transactionHash', function (hash) {
            // console.log('tx hash = ', hash);
        })
        .once('receipt', function (receipt) {
            
            // console.log('tx receipt = ', receipt);
        })
        .on('confirmation', function (confNumber, receipt) {
            // console.log('confirmation at ', confNumber, ' of receipt ', receipt);
            return resolve(receipt);
        })
        .on('error', function (error) {
            console.log('error sendind tx: ', error);
            return reject(error);
        })
        .then(function (receipt) {
            // console.log('found a receipt ', receipt);
            return resolve(receipt);
            // will be fired once the receipt is mined
        });
    });

// const receipt = await web3.eth.sendSignedTransaction("0x" + serializedTx);
// console.log('sent signed transaction');
  // return receipt;
  // console.log(`${JSON.stringify(receipt, null, 4)}\n`);
};

module.exports = { sendTx };
