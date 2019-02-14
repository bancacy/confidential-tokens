require("dotenv").config();

const aztec = require("aztec.js");
const { getContractAddressesForNetwork, NetworkId } = require("@aztec/contract-addresses");
const aztecArtifacts = require("@aztec/contract-artifacts");

const BN = require("bn.js");
const Tx = require("ethereumjs-tx");
const Web3 = require("web3");

// Connect web3 to the Rinkeby testnet via infura
// const url = `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`;
const url = "http://localhost:8545";
const web3 = new Web3(new Web3.providers.HttpProvider(url));
const accounts = require("./accounts");

// Declare variables
let aztecAccounts = [], aztecAddresses = {}, notes = [], noteRegistryAddress, proofs = [], proofHashes = [], proofOutputs = [];
let joinSplit, confidentialToken, erc20Mintable, noteRegistry;

// Get the Rinkeby contracts addresses
if (!process.env.CONFIDENTIAL_TOKEN_ADDRESS) {
  console.log("Please set your CONFIDENTIAL_TOKEN_ADDRESS in a .env file first");
  process.exit(1);
}
aztecAddresses = getContractAddressesForNetwork(NetworkId.Rinkeby);

NetworkId.Rinkeby = 1234;
aztecAddresses.joinSplit = "0xED39feff16E753A0468827C9adb032BE54AB419C";
aztecAddresses.erc20Mintable = "0xF3b6159EdB47B6f5Cb8608A479f201C636EC6d6d";

joinSplit = new web3.eth.Contract(aztecArtifacts.JoinSplit.abi, aztecAddresses.joinSplit);
erc20Mintable = new web3.eth.Contract(aztecArtifacts.ERC20Mintable.abi, aztecAddresses.erc20Mintable);
confidentialToken = new web3.eth.Contract(aztecArtifacts.ZKERC20.abi, process.env.CONFIDENTIAL_TOKEN_ADDRESS);

// Prepare the notes and the contracts
async function prepareNotes() {
  // Generate a bunch of random accounts
  // TODO: fix the issue with normal address account array + the aztec accounts
  // accounts = await web3.eth.getAccounts();
  aztecAccounts = [...new Array(10)].map(() => aztec.secp256k1.generateAccount());

  // Generate a bunch of random AZTEC notes
  notes = [
    ...aztecAccounts.map(({ publicKey }, i) => aztec.note.create(publicKey, i * 10)),
    ...aztecAccounts.map(({ publicKey }, i) => aztec.note.create(publicKey, i * 10)),
  ];

  // The note registry's address is dynamic
  noteRegistryAddress = await confidentialToken.methods.noteRegistry().call();
  noteRegistry = new web3.eth.Contract(aztecArtifacts.NoteRegistry.abi, noteRegistryAddress);
}

function prepareProofs() {
  // Create dem proofs
  proofs[0] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [],
    outputNotes: notes.slice(0, 2),
    senderAddress: accounts.addresses[0],
    inputNoteOwners: [],
    publicOwner: accounts.addresses[0],
    kPublic: -10,
    aztecAddress: joinSplit.options.address,
  });
  
  proofs[1] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: notes.slice(0, 2),
    outputNotes: notes.slice(2, 4),
    senderAddress: accounts.addresses[0],
    inputNoteOwners: aztecAccounts.slice(0, 2),
    publicOwner: accounts.addresses[1],
    kPublic: -40,
    aztecAddress: joinSplit.options.address,
  });

  proofs[2] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [],
    outputNotes: notes.slice(6, 8),
    senderAddress: accounts.addresses[0],
    inputNoteOwners: [],
    publicOwner: accounts.addresses[2],
    kPublic: -130,
    aztecAddress: joinSplit.options.address,
  });

  proofs[3] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: notes.slice(6, 8),
    outputNotes: notes.slice(4, 6),
    senderAddress: accounts.addresses[0],
    inputNoteOwners: aztecAccounts.slice(6, 8),
    publicOwner: accounts.addresses[2],
    kPublic: 40,
    aztecAddress: joinSplit.options.address,
  });

  proofs[4] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [],
    outputNotes: [notes[0], notes[3]],
    senderAddress: accounts.addresses[0],
    inputNoteOwners: [],
    publicOwner: accounts.addresses[3],
    kPublic: -30,
    aztecAddress: joinSplit.options.address,
  });

  proofs[5] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [notes[0], notes[3]],
    outputNotes: [notes[1], notes[2]],
    senderAddress: accounts.addresses[0],
    inputNoteOwners: [aztecAccounts[0], aztecAccounts[3]],
    publicOwner: accounts.addresses[3],
    kPublic: 0, // perfectly balanced...
    aztecAddress: joinSplit.options.address,
  });
}

async function mintAndApproveTokens() {
  // Mint ERC20 tokens
  console.log("Minting ERC20 tokens...");
  const scalingFactor = new BN(10);
  const tokensTransferred = new BN(100000);
  for (let i = 0 ; i < accounts.addresses.length; ++i) {
    const nonce = await web3.eth.getTransactionCount(accounts.addresses[i], "pending");
    const data = erc20Mintable.methods
      .mint(accounts.addresses[i], scalingFactor.mul(tokensTransferred).toString(10))
      .encodeABI();
    const rawTx = {
      nonce: nonce,
      from: accounts.addresses[i],
      to: aztecAddresses.erc20Mintable, // remember that the `to` param is the contract when you append data
      gasLimit: "0x47B760",
      gasPrice: "0x12A05F200",
      data: data,
      chainId: NetworkId.Rinkeby
    };
    const tx = new Tx(rawTx);
    const privateKey = Buffer.from(accounts.privateKeys[i], "hex");
    tx.sign(privateKey);
    const serializedTx = tx.serialize().toString("hex");
    const receipt = await web3.eth.sendSignedTransaction("0x" + serializedTx);
    console.log(`${JSON.stringify(receipt, null, 2)}\n`);
  }

  // Approve ERC20 spending
  console.log("Approving AZTEC to spend ERC20 tokens...");
  for (let i = 0; i < accounts.addresses.length; ++i) {
    const nonce = await web3.eth.getTransactionCount(accounts.addresses[i], "pending");
    const data = erc20Mintable.methods
      .approve(noteRegistryAddress, scalingFactor.mul(tokensTransferred).toString(10))
      .encodeABI();
    const rawTx = {
      nonce: nonce,
      from: accounts.addresses[i],
      to: aztecAddresses.erc20Mintable, // remember that the `to` param is the contract when you append data
      gasLimit: "0x47B760",
      gasPrice: "0x12A05F200",
      data: data,
      chainId: NetworkId.Rinkeby
    };
    const tx = new Tx(rawTx); 
    const privateKey = Buffer.from(accounts.privateKeys[i], "hex");
    tx.sign(privateKey);
    const serializedTx = tx.serialize().toString("hex");
    const receipt = await web3.eth.sendSignedTransaction("0x" + serializedTx);
    console.log(`${JSON.stringify(receipt, null, 2)}\n`);
  }

  // Approve AZTEC spending
  proofOutputs = proofs.map(({ expectedOutput }) => {
    return aztec.abiEncoder.outputCoder.getProofOutput(expectedOutput, 0);
  });
  proofHashes = proofOutputs.map(proofOutput => {
    return aztec.abiEncoder.outputCoder.hashProofOutput(proofOutput);
  });

  const deltas = [10, 40, 130, 30];
  for (let i = 0; i < deltas.length; ++i) {
    const delta = deltas[i];
    const nonce = await web3.eth.getTransactionCount(accounts.addresses[i], "pending");
    const data = noteRegistry.methods
      .publicApprove(proofHashes[i], delta)
      .encodeABI();
    const rawTx = {
      nonce: nonce,
      from: accounts.addresses[i],
      to: noteRegistryAddress,
      gasLimit: "0x47B760",
      gasPrice: "0x12A05F200",
      data: data,
      chainId: NetworkId.Rinkeby
    };
    const tx = new Tx(rawTx); 
    const privateKey = Buffer.from(accounts.privateKeys[i], "hex");
    tx.sign(privateKey);
    const serializedTx = tx.serialize().toString("hex");
    const receipt = await web3.eth.sendSignedTransaction("0x" + serializedTx);
    console.log(`${JSON.stringify(receipt, null, 2)}\n`);
  }

  await sendTransactions();
}

async function sendTransactions() {
  console.log("proofs[0].proofData", proofs[0].proofData);
  const nonce = await web3.eth.getTransactionCount(accounts.addresses[0], "pending");
  const data = confidentialToken.methods
    .confidentialTransfer(proofs[0].proofData)
    .encodeABI();
  const rawTx = {
    nonce: nonce,
    from: accounts.addresses[0],
    to: confidentialToken.options.address,
    gasLimit: "0x47B760",
    gasPrice: "0x12A05F200",
    data: data,
    chainId: NetworkId.Rinkeby
  };
  const tx = new Tx(rawTx); 
  const privateKey = Buffer.from(accounts.privateKeys[0], "hex");
  tx.sign(privateKey);
  const serializedTx = tx.serialize().toString("hex");
  const receipt = await web3.eth.sendSignedTransaction("0x" + serializedTx);
  console.log(`${JSON.stringify(receipt, null, 2)}\n`);
}

prepareNotes();
prepareProofs();
// sendTransactions();
mintAndApproveTokens();
