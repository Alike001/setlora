// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @dev Standard ERC-20 return-value interface. The Portaldot asset adapter
/// must be independently tested before this contract is deployed.
interface ISetloraToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title SetloraBatch
/// @notice Atomic, invoice-number-aware batches paid by the caller in one fixed token.
/// @dev Research-stage contract. Not audited. No custody or administrator.
/// @dev Invoice numbers are unique only per payer, inside this contract.
contract SetloraBatch {
    uint256 public constant MAX_INVOICES = 10;
    ISetloraToken public immutable token;

    // Up to 256 invoice numbers per storage word, scoped to the paying wallet.
    mapping(address payer => mapping(uint256 word => uint256 flags)) private settledWords;
    bool private entered;

    error InvalidToken();
    error InvalidBatch();
    error InvalidInvoice(uint256 index);
    error AlreadySettled(uint256 invoiceNumber);
    error TransferFailed(uint256 index);
    error Reentered();

    event InvoiceSettled(
        address indexed payer,
        uint256 indexed invoiceNumber,
        address indexed recipient,
        uint256 amount
    );
    event BatchSettled(address indexed payer, uint256 count, uint256 total);

    constructor(address tokenAddress) {
        if (tokenAddress == address(0)) revert InvalidToken();
        // Do not use code.length: native precompiles can have special code semantics.
        token = ISetloraToken(tokenAddress);
    }

    function isSettled(address payer, uint256 invoiceNumber) public view returns (bool) {
        uint256 wordIndex = invoiceNumber >> 8;
        uint256 flag = uint256(1) << (invoiceNumber & 255);
        return (settledWords[payer][wordIndex] & flag) != 0;
    }

    function bitmapOf(address payer, uint256 wordIndex) external view returns (uint256) {
        return settledWords[payer][wordIndex];
    }

    /// @notice Pays all requested invoices, or none of them.
    /// @dev The calling wallet explicitly authorizes all supplied destinations and amounts.
    /// @dev Approval for this contract must already exist on the fixed payment token.
    /// @dev Uses two phases: validate/mark ALL invoices, then make external token calls.
    function settle(
        uint256[] calldata invoiceNumbers,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        if (entered) revert Reentered();
        uint256 count = invoiceNumbers.length;
        if (count == 0 || count > MAX_INVOICES || recipients.length != count || amounts.length != count) {
            revert InvalidBatch();
        }
        entered = true;

        uint256 total = 0;
        for (uint256 i = 0; i < count; ++i) {
            uint256 invoiceNumber = invoiceNumbers[i];
            uint256 amount = amounts[i];
            if (invoiceNumber == 0 || recipients[i] == address(0) || amount == 0) {
                revert InvalidInvoice(i);
            }
            uint256 wordIndex = invoiceNumber >> 8;
            uint256 flag = uint256(1) << (invoiceNumber & 255);
            uint256 existing = settledWords[msg.sender][wordIndex];
            if ((existing & flag) != 0) revert AlreadySettled(invoiceNumber);
            settledWords[msg.sender][wordIndex] = existing | flag;
            total += amount;
        }

        // Calls happen AFTER all invoice numbers are marked, under the guard.
        // Any failed call reverts the entire EVM transaction, including all token transfers.
        for (uint256 i = 0; i < count; ++i) {
            if (!token.transferFrom(msg.sender, recipients[i], amounts[i])) {
                revert TransferFailed(i);
            }
            emit InvoiceSettled(msg.sender, invoiceNumbers[i], recipients[i], amounts[i]);
        }

        entered = false;
        emit BatchSettled(msg.sender, count, total);
    }
}
