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
  const receipt = await web3.eth.sendSignedTransaction("0x" + serializedTx);
  // console.log(`${JSON.stringify(receipt, null, 4)}\n`);
};

module.exports = { sendTx };
