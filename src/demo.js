require("dotenv").config();

const aztec = require("aztec.js");
const { getContractAddressesForNetwork, NetworkId } = require("@aztec/contract-addresses");
const aztecArtifacts = require("@aztec/contract-artifacts");
const { constants: { ERC20_SCALING_FACTOR } } = require("@aztec/dev-utils");

const BN = require("bn.js");
const path = require("path");
const fs = require('fs');
const accounts = require(path.join(__dirname, "accounts"));
const { sendTx } = require(path.join(__dirname, "tx"));
const web3 = require(path.join(__dirname, "web3Provider"));

const noteCoder = require('./noteCoder');

const account = aztec.secp256k1.accountFromPrivateKey(accounts[0].privateKey);

console.log('account public key = ', account.publicKey);
// Declare variables
let notes = [], proofs = [], proofHashes = [], proofOutputs = [];

// Get the Rinkeby contracts addresses
const { confidentialTokenAddress } = JSON.parse(fs.readFileSync('zkAsset.json')); // '0x8A7e7dD1b736B37e953f35a4dC4d103113d3D9Ca';
aztecAddresses = getContractAddressesForNetwork(NetworkId.Rinkeby);

const ACE = new web3.eth.Contract(aztecArtifacts.ACE.abi, aztecAddresses.ACE);
const joinSplit = new web3.eth.Contract(aztecArtifacts.JoinSplit.abi, aztecAddresses.JoinSplit);
const erc20Mintable = new web3.eth.Contract(aztecArtifacts.ERC20Mintable.abi, aztecAddresses.ERC20Mintable);
const confidentialToken = new web3.eth.Contract(aztecArtifacts.ZkAsset.abi, confidentialTokenAddress);

// -------------------------------------------------------------------------------
async function getNotes() {
    const createEvents = await confidentialToken.getPastEvents('CreateNote', {
        filter: { owner: account.address },
        fromBlock: 0,
        toBlock: 'latest'
    });
    const destroyEvents = await confidentialToken.getPastEvents('DestroyNote', {
        filter: { owner: account.address },
        fromBlock: 0,
        toBlock: 'latest'
    });
    const notePromises = createEvents.filter((event) => {
        let valid = true;
        destroyEvents.forEach((destroyEvent) => {
            if (destroyEvent.returnValues.noteHash === event.returnValues.noteHash) {
                valid = false;
            }
        });
        return valid;
    }).map((event) => {
        const metadata = event.returnValues.metadata;
        return noteCoder.fromEventData(metadata, account.privateKey);
    });
    const notes = await Promise.all(notePromises);
    return notes;
    console.log('notes = ', notes);
}

// -------------------------------------------------------------------------------
// Prepare the notes and the contracts
async function generateInitialNotes() {
    // Generate a bunch of random AZTEC notes
    const notePromises = [
        aztec.note.create(account.publicKey, 100),
        aztec.note.create(account.publicKey, 100),
        aztec.note.create(account.publicKey, 100),
        aztec.note.create(account.publicKey, 100)
    ];
    const notes = await Promise.all(notePromises);

    // Create dem proofs
    proofs[0] = aztec.proof.joinSplit.encodeJoinSplitTransaction({
        inputNotes: [],
        outputNotes: notes.slice(0, 4),
        senderAddress: account.address,
        inputNoteOwners: [],
        publicOwner: account.address,
        kPublic: -400,
        validatorAddress: aztecAddresses.ACE,
    });

    // Generate proof outputs and hashes
    proofOutputs = proofs.map(({ expectedOutput }) => {
        return aztec.abiEncoder.outputCoder.getProofOutput(expectedOutput, 0);
    });
    proofHashes = proofOutputs.map(proofOutput => {
        return aztec.abiEncoder.outputCoder.hashProofOutput(proofOutput);
    });

    mintAndApproveTokens();
}

async function mintAndApproveTokens() {
    // The note registry's address is unique for each confidential token
    // const noteRegistryAddress = await confidentialToken.methods.noteRegistry().call();
    // noteRegistry = new web3.eth.Contract(aztecArtifacts.NoteRegistry.abi, noteRegistryAddress);

    // Mint ERC20 tokens
    console.log("Minting ERC20 tokens...");
    const tokensTransferred = new BN(100000);
    const mintData = erc20Mintable
        .methods
        .mint(account.address, ERC20_SCALING_FACTOR.mul(tokensTransferred).toString(10))
        .encodeABI();
    await sendTx({
        from: account.address,
        to: aztecAddresses.ERC20Mintable,
        data: mintData,
        privateKey: account.privateKey,
    });

    // Approve ERC20 spending
    console.log("Approving AZTEC to spend ERC20 tokens...");
    const approveData = erc20Mintable
        .methods
        .approve(aztecAddresses.ACE, ERC20_SCALING_FACTOR.mul(tokensTransferred).toString(10))
        .encodeABI();
    await sendTx({
        from: account.address,
        to: aztecAddresses.ERC20Mintable,
        data: approveData,
        privateKey: account.privateKey,
    });

    // Approve AZTEC spending
    console.log("Approving AZTEC to spend notes...");
    for (let i = 0; i < proofs.length; ++i) {
        let data = ACE
            .methods
            .publicApprove(confidentialTokenAddress, proofHashes[i], ERC20_SCALING_FACTOR.mul(tokensTransferred).toString(10))
            .encodeABI();
        await sendTx({
            from: account.address,
            to: aztecAddresses.ACE,
            data: data,
            privateKey: account.privateKey,
        });
    }

    console.log("Making a confidential token transfer...");
    let data = confidentialToken
        .methods
        .confidentialTransfer(proofs[0].proofData)
        .encodeABI();

    const receipt = await sendTx({
        from: account.address,
        to: confidentialTokenAddress,
        data: data,
        privateKey: account.privateKey,
    });
    console.log('Mined confidential token transfer! receipt = ', JSON.stringify(receipt));
}


// -------------------------------------------------------------------------------
async function confidentialTransfer(recipientPublicKey, value) {
    const noteCache = await getNotes();
    let sum = 0;
    const inputNotes = [];
    let iterator = 0;
    while (sum < value) {
        if (iterator >= noteCache.length) {
            throw new Error('balance insufficient!');
        }
        inputNotes.push({
            ...noteCache[iterator],
            owner: account.address,
        });
        sum += noteCache[iterator].k.toNumber();
        iterator += 1;
    }
    const remainder = sum - value;
    const outputNotePromises = [
        aztec.note.create(account.publicKey, remainder),
        aztec.note.create(recipientPublicKey, value),
    ];
    const outputNotes = await Promise.all(outputNotePromises);
    const inputNoteOwners = inputNotes.map(() => account);
    const proof = aztec.proof.joinSplit.encodeJoinSplitTransaction({
        inputNotes,
        outputNotes,
        senderAddress: account.address,
        inputNoteOwners,
        publicOwner: '',
        kPublic: 0,
        validatorAddress: aztecAddresses.JoinSplit,
        
    });

    inputNotes.forEach((note) => { console.log('input note k = ', note.k.toString(10)); });
    outputNotes.forEach((note) => { console.log('output note k = ', note.k.toString(10)); });

    const data = confidentialToken
        .methods
        .confidentialTransfer(proof.proofData)
        .encodeABI();

    const receipt = await sendTx({
        from: account.address,
        to: confidentialTokenAddress,
        data: data,
        privateKey: account.privateKey,
    });
    console.log('confidential transfer has been mined!, receipt = ', JSON.stringify(receipt));
}

confidentialTransfer('0x046ab29946a840fee08f4417ad14f6af3c7570281f1fe4243d3cc81ce40da6dccb8bcf7eac596677a90538d47b7d27fc04995bf96e36a5b2e1b672da0cb523d3e0', 10)
.then(() => { console.log('transfer completed!'); })
.catch((e) => { console.log('huh? ', e); });
// generateInitialNotes();
