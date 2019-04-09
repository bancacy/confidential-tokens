# AZTEC hands on workshop 

### Required dependencies  

1. Truffle (0.5.0 or later)  
2. Solc (0.5.4 or later)  
3. Node.js  
   
### Setting up  

1. `truffle init`  
2. `npm install @aztec/aztec.js@0.7.0`
3. `npm install @aztec/contract-artifacts@0.1.0`


### The AZTEC note

A `Note` is an UXTO-type object with the following *public* information:  

1. An `address owner`  
2. A public key  

The note's *private* information is the following:  

1. A 32-byte **viewing key**
2. A 32-byte **spending key**  
3. A `uint value`

Viewing keys can be used to decrypt the **public key** and extract the value of the note.  

Viewing keys must be unique to a given note - re-using them is a security risk. To prevent a user from having to manage a large viewing key set, we derive viewing keys from a user's spending key.  

A stealth address system can be used to create spending keys that are not mappable to any on-chain identity. But in the base protocol, the spending key is a user's private key.

### Creating an AZTEC note  

To create an AZTEC note for a user, that user's *public key* is required.

```
const aztec = require('aztec.js);

// generate a random account for alice
const alice = aztec.secp256k1.generateAccount();
// create a note with a value of '100'
const note = aztec.note.create(alice.publicKey, 100);
```

# Constructing AZTEC zero-knowledge proofs  

The AZTEC protocol contains several proofs that can be combined in a modular fashion to create more expressive transactions, but we'll focus on basic value transfer: the **join-split** transaction.

This contains the following:  

* `Note[] inputNotes`
* `Note[] outputNotes`
* `address publicOwner`
* `int publicValue`

And proves that `SUM(inputNotes) = SUM(outputNotes) + publicValue`.

```
const aztec = require('aztec.js');
// generate accounts for alice and bob
const alice = aztec.secp256k1.generateAccount();
const bob = aztec.secp256k1.generateAccount();

// let's construct a join-split proof that converts 100 tokens
// into AZTEC notes
const aliceNotes = [
    aztec.note.create(alice.publicKey, 40);
    aztec.note.create(alice.publicKey, 60),
    aztec.note.create(alice.publicKey, 0) // notes can be worth 0!
];

// create the proof
const proof = aztec.proof.joinSplit.encodeJoinSplitTransaction({
    inputNotes: [], // alice has no notes yet
    outputNotes: aliceNotes, // we want to make these
    senderAddress: alice.address, // this proof will only be valid when send from this address 
    inputNoteOwners: [], // if we had input notes we would need to pass in spending keys here
    publicOwner: alice.address, // this is the address we're transferring tokens from
    kPublic: -100, // this value is negative if converting from public -> private 
});
```

`const proof` contains the zero-knowledge proof that an AZTEC confidential asset requires, to validate a transaction!  

Now that we have our proof, we need a confidential digital asset!  


# Creating a `ZkAsset.sol` smart contract on Ethereum  

N.B. This follows the `ERC1724` confidential token specification. We're going to be building the template contract [https://github.com/AztecProtocol/AZTEC/blob/master/packages/protocol/contracts/ZkAsset/ZkAsset.sol](in our monorepo).

We're going to be creating a **private** digital asset, that can be converted to/from an existing **public** ERC20 token.

## The AZTEC cryptography engine  

All AZTEC-compatible assets subscribe to `ACE`, a smart contract that validates zero-knowledge proofs and converts **proof data** into **transfer instructions**.  

To start with, create a contract that, on creation, creates a new *note registry* inside `ACE`:  

```
pragma solidity >=0.5.0 <0.6.0;

contract ZkAsset {
    ACE public ace;

    constructor (
        address _aceAddress,
        address _linkedTokenAddress,
        uint256 _scalingFactor,
    ) public {
        ace = ACE(_aceAddress);
        ace.createNoteRegistry(
            _linkedTokenAddress,
            _scalingFactor,
            false, // set this to true to directly print/burn AZTEC notes
            true, // set this to false to prevent conversion between tokens <=> AZTEC notes
        );
    }
}
```

### Implementing a confidential transfer  

We can call `ace.validateProof` to validate a zero-knowledge proof, passing in some `bytes proofData` and a `uint24 proofId`. The `proofId` for the join-split proof is `0x010101`.  

We also need for forward the address of the message sender - this protects a user's proof from being broadcast by an unintended address (so no front-running).

```
function confidentialTransfer(bytes memory _proofData) public {
    bytes memory proofOutputs = ace.validateProof(0x010101, msg.sender, _proofData);
    // process proofOutputs...
}
```

### Updating the note registry

The transfer instruction that `ACE` returns to us uses a custom ABI encoding due to its complexity.  

`bytes proofOutputs` is an array of `bytes proofOutput` objects. The join-split proof will always have 1 entry (other proofs can have more).  

We can extract this data with a helper library, `NoteUtils.sol`.  

Once ACE has validated a proof, we can instruct `ACE` to update our asset's note registry via `ace.updateNoteRegistry`. This will also trigger any transfers of tokens that are required.

```
pragma solidity >=0.5.0 <0.6.0;

import "@aztec/protocol/contracts/libs/NoteUtils.sol";

contract zkAsset {
    using NoteUtils for bytes;


    function confidentialTransfer(bytes memory _proofData) public {
        // if proof is invalid, ace.validateProof will cause tx to throw
        bytes memory proofOutput = ace.validateProof(0x010101, msg.sender, _proofData).get(0);
        (
            bytes memory inputNotes,
            bytes memory outputNotes,
            address publicOwner,
            int256 publicvalue
        ) = proofOutputs.extractProofOutput();

        ace.updateNoteRegistry(
            0x010101, // the uint24 proofId
            proofOutput, // the proof output
            address(this) // who asked ACE to validate the proof? we did, that's who!
        );
    }
}
```

### Cleaning up - emitting events  

We want to emit events so that users can determine when they have recieved/spent notes. To do this, we're going to pull the following information from `bytes proofOutputs`: 

* `bytes inputNotes`  
* `bytes outputNotes`  
* `address publicOwner`  
* `int256 publicValue`

```
    event CreateNote(address indexed owner, bytes32 indexed noteHash, bytes metadata);
    event DestroyNote(address indexed owner, bytes32 indexed noteHash, bytes metadata);
    event ConvertTokens(address indexed owner, uint256 value);
    event RedeemTokens(address indexed owner, uint256 value);

    function logInputNotes(bytes memory _inputNotes) internal {
        for (uint i = 0; i < _inputNotes.getLength(); i += 1) {
            (address noteOwner, bytes32 noteHash, bytes memory metadata) = _inputNotes.get(i).extractNote();
            emit DestroyNote(noteOwner, noteHash, metadata);
        }
    }

    function logOutputNotes(bytes memory outputNotes) internal {
        for (uint i = 0; i < outputNotes.getLength(); i += 1) {
            (address noteOwner, bytes32 noteHash, bytes memory metadata) = outputNotes.get(i).extractNote();
            emit CreateNote(noteOwner, noteHash, metadata);
        }
    }

    function broadcastTransferEvents(bytes memory _proofOutput) internal {
        (
            bytes memory inputNotes,
            bytes memory outputNotes,
            address publicOwner,
            int256 publicValue
        ) = _proofOutput.extractProofOutput();

        logInputNotes(inputNotes);
        logOutputNotes(outputNotes);
        if (publicValue < 0) {
            emit ConvertTokens(publicOwner, uint256(-publicValue));
        }
        if (publicValue > 0) {
            emit RedeemTokens(publicOwner, uint256(publicValue));
        }
    }
```


### Putting it all together: our `zkAsset.sol`  

```
pragma solidity >=0.5.0 <0.6.0;

import "@aztec/protocol/contracts/libs/NoteUtils.sol";

contract zkAsset {
    using NoteUtils for bytes;

    ACE public ace;

    constructor (
        address _aceAddress,
        address _linkedTokenAddress,
        uint256 _scalingFactor,
    ) public {
        ace = ACE(_aceAddress);
        ace.createNoteRegistry(
            _linkedTokenAddress,
            _scalingFactor,
            false, // set this to true to directly print/burn AZTEC notes
            true, // set this to false to prevent conversion between tokens <=> AZTEC notes
        );
    }


    event CreateNote(address indexed owner, bytes32 indexed noteHash, bytes metadata);
    event DestroyNote(address indexed owner, bytes32 indexed noteHash, bytes metadata);
    event ConvertTokens(address indexed owner, uint256 value);
    event RedeemTokens(address indexed owner, uint256 value);

    function logInputNotes(bytes memory _inputNotes) internal {
        for (uint i = 0; i < _inputNotes.getLength(); i += 1) {
            (address noteOwner, bytes32 noteHash, bytes memory metadata) = _inputNotes.get(i).extractNote();
            emit DestroyNote(noteOwner, noteHash, metadata);
        }
    }

    function logOutputNotes(bytes memory outputNotes) internal {
        for (uint i = 0; i < outputNotes.getLength(); i += 1) {
            (address noteOwner, bytes32 noteHash, bytes memory metadata) = outputNotes.get(i).extractNote();
            emit CreateNote(noteOwner, noteHash, metadata);
        }
    }

    function broadcastTransferEvents(bytes memory _proofOutput) internal {
        (
            bytes memory inputNotes,
            bytes memory outputNotes,
            address publicOwner,
            int256 publicValue
        ) = _proofOutput.extractProofOutput();

        logInputNotes(inputNotes);
        logOutputNotes(outputNotes);
        if (publicValue < 0) {
            emit ConvertTokens(publicOwner, uint256(-publicValue));
        }
        if (publicValue > 0) {
            emit RedeemTokens(publicOwner, uint256(publicValue));
        }
    }


    function confidentialTransfer(bytes memory _proofData) public {
        // if proof is invalid, ace.validateProof will cause tx to throw
        bytes memory proofOutput = ace.validateProof(0x010101, msg.sender, _proofData).get(0);
        (
            bytes memory inputNotes,
            bytes memory outputNotes,
            address publicOwner,
            int256 publicvalue
        ) = proofOutputs.extractProofOutput();

        ace.updateNoteRegistry(
            0x010101, // the uint24 proofId
            proofOutput, // the proof output
            address(this) // who asked ACE to validate the proof? we did, that's who!
        );
        broadcastEvents(proofOutput);
    }
```

# Extensions  

* Bilateral trades
* Implementing `confidentialTransferFrom`
