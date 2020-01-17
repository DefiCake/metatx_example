pragma solidity ^0.5.0;

import "@openzeppelin/contracts/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777.sol";

contract MetaTx  {
    using ECDSA for bytes32; // Lib de OpenZeppelin con helpers para ecrecovery

    mapping(bytes32 => bool) swaps; // Firmas usadas

    // Con una firma vaĺida de Alice (signer), permite a Bob (msg.sender) intercambiar
    // tokens de un contrato ERC777 (token1addr, token1amount) 
    // por tokens de otro contrato ERC777 (token2addr, token2amount)
    // si no hemos pasado el deadline
    function atomicSwap(
        bytes32 msgHash, 
        address token1addr,
        uint token1amount,
        address token2addr,
        uint token2amount,
        uint deadline,
        bytes calldata signature
    ) external 
    {
        // Primero, compruebo que la firma es válida
        bytes32 ethHash = msgHash.toEthSignedMessageHash(); // Hago las parafernalias de las librerías de web3
        address signer = ethHash.recover(signature); // Compruebo firma

        // Luego compruebo que los parámetros son correctos y se corresponden
        // con el hash firmado
        require(
            hashIsCorrect(
                msgHash, 
                token1addr, 
                token1amount, 
                token2addr, 
                token2amount, 
                deadline
            ),
            "Hash computation did not succeed"
        );
        // Compruebo que el deadline no ha pasado
        require(now < deadline, "This swap is outdated");
        // Compruebo que la firma no se ha usado ya
        require(!swaps[msgHash], "This swap was already used");

        // Marco la firma como usada para que no se vuelva a usar en el futuro
        swaps[msgHash] = true;

        // Finalmente realizo la operación de intercambio:
        // Tokens de Alice (signer) van a Bob (msg.sender)
        // Tokens de Bob (msg.sender) van a Alice (signer)
        IERC777(token1addr).operatorSend(signer, msg.sender, token1amount, "", "");
        IERC777(token2addr).operatorSend(msg.sender, signer, token2amount, "", "");
    }

    // Comprueba que signature es el hash msgHash firmado por signer
    function isSignedBy(
        address signer, 
        bytes32 msgHash, 
        bytes calldata signature
    ) 
        external 
        pure 
        returns (bool) 
    {
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        return (ethHash.recover(signature) == signer);
    }


    // Helpers: puedes ignorarlos, los he usado para comprobar algunas cosas
    // mientras desarrollaba

    function hashIsCorrect(
        bytes32 msgHash, 
        address token1addr,
        uint token1amount,
        address token2addr,
        uint token2amount,
        uint deadline
    ) 
        public
        pure 
        returns (bool)
    {
        return msgHash == keccak256(
            abi.encodePacked(
                token1addr, 
                token1amount, 
                token2addr, 
                token2amount, 
                deadline
            )
        );
    }

    function extractMsgHash(bytes memory arr) public pure returns (uint, bytes memory) {

        uint8 prefLen = 28;

        if(arr.length < prefLen)
            return (arr.length, arr);

        bytes memory result = new bytes(arr.length - prefLen);

        for(uint i = prefLen; i < arr.length; i++) {
            result[i-prefLen] = arr[i];
        }

        return (arr.length, result);
    }

    function ethSignedHash(bytes32 messageHash) public pure returns(bytes32) {
        return messageHash.toEthSignedMessageHash();
    }

    function recover(bytes32 messageHash, bytes memory signature) public pure returns(address) {
        return messageHash.recover(signature);
    }


}
