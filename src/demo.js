require("dotenv").config();

const aztec = require("aztec.js");
const { getContractAddressesForNetwork, NetworkId } = require("@aztec/contract-addresses");
const aztecArtifacts = require("@aztec/contract-artifacts");

const BN = require("bn.js");
const fs = require("fs").promises;
const path = require("path");

const accounts = require(path.join(__dirname, "accounts"));
const { sendTx } = require(path.join(__dirname, "tx"));
const web3 = require(path.join(__dirname, "web3Provider"));

// Declare variables
let aztecAccounts = [], aztecAddresses = {}, notes = [], proofs = [], proofHashes = [], proofOutputs = [];
let joinSplit, confidentialToken, erc20Mintable, noteRegistry;

// Get the Rinkeby contracts addresses
if (!process.env.CONFIDENTIAL_TOKEN_ADDRESS) {
  console.log("Please set your CONFIDENTIAL_TOKEN_ADDRESS in a .env file first");
  process.exit(1);
}
aztecAddresses = getContractAddressesForNetwork(NetworkId.Rinkeby);

// process.env.CONFIDENTIAL_TOKEN_ADDRESS = "0x61040750d542ca72216E91c6379571b758902Ef2";
// aztecAddresses.erc20Mintable = "0x351D6e8B1E647FB635CbeF0C155fDD4df21a0007";
// aztecAddresses.joinSplit = "0x43dbD4f0d5e106cA38540Bc94E8041A0d23e9cC3";

joinSplit = new web3.eth.Contract(aztecArtifacts.JoinSplit.abi, aztecAddresses.joinSplit);
erc20Mintable = new web3.eth.Contract(aztecArtifacts.ERC20Mintable.abi, aztecAddresses.erc20Mintable);
confidentialToken = new web3.eth.Contract(aztecArtifacts.ZKERC20.abi, process.env.CONFIDENTIAL_TOKEN_ADDRESS);

// Prepare the notes and the contracts
async function prepareNotes() {
  // Generate a bunch of random accounts
  aztecAccounts = [...new Array(2)].map(() => aztec.secp256k1.generateAccount());
  await fs.writeFile(path.join(__dirname, "aztecAccounts.json"), JSON.stringify(aztecAccounts, null, 4));

  // Generate a bunch of random AZTEC notes
  notes = [
    aztec.note.create(aztecAccounts[0].publicKey, 5),
    aztec.note.create(aztecAccounts[0].publicKey, 5),
    aztec.note.create(aztecAccounts[1].publicKey, 8),
    aztec.note.create(aztecAccounts[0].publicKey, 2)
  ];

  // The note registry's address is unique for each confidential token
  const noteRegistryAddress = await confidentialToken.methods.noteRegistry().call();
  noteRegistry = new web3.eth.Contract(aztecArtifacts.NoteRegistry.abi, noteRegistryAddress);
}

function prepareProofs() {
  // Create dem proofs
  proofs[0] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [],
    outputNotes: notes.slice(0, 2),
    senderAddress: accounts[0].address,
    inputNoteOwners: [],
    publicOwner: accounts[0].address,
    kPublic: -10,
    aztecAddress: joinSplit.options.address,
  });

  proofs[1] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: notes.slice(0, 2),
    outputNotes: notes.slice(2, 4),
    senderAddress: accounts[0].address,
    inputNoteOwners: [aztecAccounts[0], aztecAccounts[0]],
    publicOwner: accounts[0].address,
    kPublic: 0,
    aztecAddress: joinSplit.options.address,
  });

  // Generate proof outputs and hashes
  proofOutputs = proofs.map(({ expectedOutput }) => {
    return aztec.abiEncoder.outputCoder.getProofOutput(expectedOutput, 0);
  });
  proofHashes = proofOutputs.map(proofOutput => {
    return aztec.abiEncoder.outputCoder.hashProofOutput(proofOutput);
  });
}

async function mintAndApproveTokens() {
  // Mint ERC20 tokens
  console.log("Minting ERC20 tokens...");
  const scalingFactor = new BN(10);
  const tokensTransferred = new BN(100000);
  for (let i = 0 ; i < accounts.length; ++i) {
    const data = erc20Mintable
      .methods
      .mint(accounts[i].address, scalingFactor.mul(tokensTransferred).toString(10))
      .encodeABI();
    await sendTx({
      from: accounts[i].address,
      to: aztecAddresses.erc20Mintable,
      data: data,
      privateKey: accounts[i].privateKey,
    });
  }

  // Approve ERC20 spending
  console.log("Approving AZTEC to spend ERC20 tokens...");
  for (let i = 0; i < accounts.length; ++i) {
    const data = erc20Mintable
      .methods
      .approve(noteRegistry.options.address, scalingFactor.mul(tokensTransferred).toString(10))
      .encodeABI();
    await sendTx({
      from: accounts[i].address,
      to: aztecAddresses.erc20Mintable,
      data: data,
      privateKey: accounts[i].privateKey,
    });
  }

  // Approve AZTEC spending
  console.log("Approving AZTEC to spend notes...");
  const delta = 10;
  let data = noteRegistry
    .methods
    .publicApprove(proofHashes[0], delta)
    .encodeABI();
  await sendTx({
    from: accounts[0].address,
    to: noteRegistry.options.address,
    data: data,
    privateKey: accounts[0].privateKey,
  });

  await sendTransactions();
}

/**
 * 1. Convert a public ERC20 balance to AZTEC note
 * 2. Can update a note registry by consuming input notes, with kPublic negative
 */
async function sendTransactions() {
  console.log("Doing a confidential token transfer...")
  let data = confidentialToken
    .methods
    .confidentialTransfer(proofs[0].proofData)
    .encodeABI();
  await sendTx({
    from: accounts[0].address,
    to: confidentialToken.options.address,
    data: data,
    privateKey: accounts[0].privateKey,
  });

  data = confidentialToken
    .methods
    .confidentialTransfer(proofs[1].proofData)
    .encodeABI();
  await sendTx({
    from: accounts[0].address,
    to: confidentialToken.options.address,
    data: data,
    privateKey: accounts[0].privateKey,
  });
}

prepareNotes();
prepareProofs();
mintAndApproveTokens();
