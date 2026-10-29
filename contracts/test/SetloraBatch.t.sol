// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../src/SetloraBatch.sol";

/// @dev Plain Solidity Foundry tests: no forge-std or dependency installation needed.
contract MockPusd {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public callCount;
    uint256 public failOnCall;

    function mint(address user, uint256 amount) external { balanceOf[user] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function setFailure(uint256 callNumber) external { failOnCall = callNumber; }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        callCount += 1;
        if (callCount == failOnCall) return false;
        if (allowance[from][msg.sender] < amount || balanceOf[from] < amount) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract CallbackPusd is MockPusd {
    SetloraBatch public target;
    bool public attempted;
    bool public blocked;

    function setTarget(SetloraBatch newTarget) external { target = newTarget; }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (!attempted) {
            attempted = true;
            uint256[] memory ids = new uint256[](1);
            address[] memory tos = new address[](1);
            uint256[] memory values = new uint256[](1);
            ids[0] = 999;
            tos[0] = to;
            values[0] = amount;
            (bool success, bytes memory data) = address(target).call(
                abi.encodeWithSelector(SetloraBatch.settle.selector, ids, tos, values)
            );
            bytes4 selector;
            if (data.length >= 4) {
                assembly { selector := mload(add(data, 32)) }
            }
            blocked = !success && selector == SetloraBatch.Reentered.selector;
        }
        return super.transferFrom(from, to, amount);
    }
}

contract SecondaryPayer {
    MockPusd public token;
    SetloraBatch public batch;
    constructor(MockPusd token_, SetloraBatch batch_) { token = token_; batch = batch_; }
    function pay(uint256 number, address recipient, uint256 amount) external {
        token.approve(address(batch), amount);
        uint256[] memory ids = new uint256[](1);
        address[] memory tos = new address[](1);
        uint256[] memory values = new uint256[](1);
        ids[0] = number;
        tos[0] = recipient;
        values[0] = amount;
        batch.settle(ids, tos, values);
    }
}

contract SetloraBatchTest {
    uint256 private constant UNIT = 1_000_000; // 6-decimal example asset
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CAROL = address(0xCA201);

    function _setup() internal returns (MockPusd asset, SetloraBatch batch) {
        asset = new MockPusd();
        batch = new SetloraBatch(address(asset));
        asset.mint(address(this), 100 * UNIT);
        asset.approve(address(batch), type(uint256).max);
    }

    function _three() internal pure returns (
        uint256[] memory ids, address[] memory recipients, uint256[] memory amounts
    ) {
        ids = new uint256[](3);
        recipients = new address[](3);
        amounts = new uint256[](3);
        ids[0] = 1; ids[1] = 2; ids[2] = 3;
        recipients[0] = ALICE; recipients[1] = BOB; recipients[2] = CAROL;
        amounts[0] = 2 * UNIT; amounts[1] = 3 * UNIT; amounts[2] = 4 * UNIT;
    }

    function _one(uint256 number, address recipient, uint256 amount) internal pure returns (
        uint256[] memory ids, address[] memory tos, uint256[] memory values
    ) {
        ids = new uint256[](1); tos = new address[](1); values = new uint256[](1);
        ids[0] = number; tos[0] = recipient; values[0] = amount;
    }

    function _mustRevert(SetloraBatch batch, uint256[] memory ids, address[] memory recipients,
        uint256[] memory amounts
    ) internal {
        (bool ok,) = address(batch).call(abi.encodeWithSelector(
            SetloraBatch.settle.selector, ids, recipients, amounts
        ));
        require(!ok, "expected revert");
    }

    function testThreePaymentsAndBitmap() public {
        (MockPusd asset, SetloraBatch batch) = _setup();
        (uint256[] memory ids, address[] memory tos, uint256[] memory values) = _three();
        batch.settle(ids, tos, values);
        require(asset.balanceOf(ALICE) == 2 * UNIT, "Alice amount");
        require(asset.balanceOf(BOB) == 3 * UNIT, "Bob amount");
        require(asset.balanceOf(CAROL) == 4 * UNIT, "Carol amount");
        require(batch.isSettled(address(this), 1), "invoice 1 missing");
        require(batch.isSettled(address(this), 2), "invoice 2 missing");
        require(batch.isSettled(address(this), 3), "invoice 3 missing");
        require(batch.bitmapOf(address(this), 0) == 14, "expected bits 1,2,3");
    }

    function testDuplicateNumbersInSameBatchRevertsEverything() public {
        (MockPusd asset, SetloraBatch batch) = _setup();
        (uint256[] memory ids, address[] memory tos, uint256[] memory values) = _three();
        ids[1] = ids[0];
        _mustRevert(batch, ids, tos, values);
        require(asset.balanceOf(ALICE) == 0 && asset.balanceOf(BOB) == 0, "partial payment");
        require(!batch.isSettled(address(this), 1), "partial flag");
    }

    function testReplayAcrossBatchesRevertsEverything() public {
        (MockPusd asset, SetloraBatch batch) = _setup();
        (uint256[] memory ids, address[] memory tos, uint256[] memory values) = _one(7, ALICE, UNIT);
        batch.settle(ids, tos, values);
        (ids, tos, values) = _three();
        ids[1] = 7;
        _mustRevert(batch, ids, tos, values);
        require(asset.balanceOf(ALICE) == UNIT, "replayed payment");
        require(asset.balanceOf(BOB) == 0, "partial second batch");
        require(!batch.isSettled(address(this), 1), "partial new flag");
        require(batch.isSettled(address(this), 7), "original missing");
    }

    function testInsufficientFundsRollsBackAll() public {
        (MockPusd asset, SetloraBatch batch) = _setup();
        (uint256[] memory ids, address[] memory tos, uint256[] memory values) = _three();
        values[2] = 100 * UNIT;
        _mustRevert(batch, ids, tos, values);
        require(asset.balanceOf(ALICE) == 0 && asset.balanceOf(BOB) == 0, "partial payment");
        require(batch.bitmapOf(address(this), 0) == 0, "flags not rolled back");
    }

    function testSecondTokenTransferFailureRollsBackAll() public {
        (MockPusd asset, SetloraBatch batch) = _setup();
        asset.setFailure(2);
        (uint256[] memory ids, address[] memory tos, uint256[] memory values) = _three();
        _mustRevert(batch, ids, tos, values);
        require(asset.balanceOf(ALICE) == 0 && asset.balanceOf(BOB) == 0, "partial payment");
        require(batch.bitmapOf(address(this), 0) == 0, "flags not rolled back");
    }

    function testInvalidRecipientAndZeroAmountRejected() public {
        (MockPusd asset, SetloraBatch batch) = _setup();
        (uint256[] memory ids, address[] memory tos, uint256[] memory values) = _one(10, address(0), UNIT);
        _mustRevert(batch, ids, tos, values);
        tos[0] = ALICE; values[0] = 0;
        _mustRevert(batch, ids, tos, values);
        ids[0] = 0; values[0] = UNIT;
        _mustRevert(batch, ids, tos, values);
        require(asset.balanceOf(ALICE) == 0 && batch.bitmapOf(address(this), 0) == 0, "bad state");
    }

    function testDifferentPayersMayReuseNumbers() public {
        (MockPusd asset, SetloraBatch batch) = _setup();
        SecondaryPayer other = new SecondaryPayer(asset, batch);
        asset.mint(address(other), 2 * UNIT);
        (uint256[] memory ids, address[] memory tos, uint256[] memory values) = _one(11, ALICE, UNIT);
        batch.settle(ids, tos, values);
        other.pay(11, BOB, UNIT);
        require(batch.isSettled(address(this), 11), "payer 1 missing");
        require(batch.isSettled(address(other), 11), "payer 2 missing");
        require(asset.balanceOf(ALICE) == UNIT && asset.balanceOf(BOB) == UNIT, "wrong amounts");
    }

    function testSeparateBitmapWords() public {
        (, SetloraBatch batch) = _setup();
        (uint256[] memory ids, address[] memory tos, uint256[] memory values) = _one(255, ALICE, UNIT);
        batch.settle(ids, tos, values);
        (ids, tos, values) = _one(256, BOB, UNIT);
        batch.settle(ids, tos, values);
        require(batch.isSettled(address(this), 255), "invoice 255 missing");
        require(batch.isSettled(address(this), 256), "invoice 256 missing");
        require(batch.bitmapOf(address(this), 0) == uint256(1) << 255, "word 0 incorrect");
        require(batch.bitmapOf(address(this), 1) == 1, "word 1 incorrect");
    }

    function testMaliciousTokenCallbackCannotReenter() public {
        CallbackPusd asset = new CallbackPusd();
        SetloraBatch batch = new SetloraBatch(address(asset));
        asset.setTarget(batch);
        asset.mint(address(this), 10 * UNIT);
        asset.approve(address(batch), type(uint256).max);
        (uint256[] memory ids, address[] memory tos, uint256[] memory values) = _one(12, ALICE, UNIT);
        batch.settle(ids, tos, values);
        require(asset.attempted(), "no callback attempted");
        require(asset.blocked(), "callback not blocked");
        require(asset.balanceOf(ALICE) == UNIT, "original payment did not happen");
        require(!batch.isSettled(address(asset), 999), "reentrant invoice marked");
    }
}
