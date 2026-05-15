// SPDX-License-Reputationer: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AdEscrow is ReentrancyGuard, Ownable {
    IERC20 public immutable usdc;

    enum EscrowStatus { FUNDED, DELIVERED, SETTLED, DISPUTED, REFUNDED }

    struct Escrow {
        address sponsorAgent;
        address communityAgent;
        uint256 amount;             // USDC (6 decimals)
        uint256 intentId;
        string deliveryProof;       // "discord:GUILD_ID:MESSAGE_ID" or "telegram:CHAT_ID:MESSAGE_ID"
        uint256 deliveredAt;
        uint256 settleAfter;        // deliveredAt + disputeWindow
        EscrowStatus status;
        uint256 sponsorErc8004Id;
        uint256 communityErc8004Id;
        bytes32 agreementHash;      // hash of final signed terms and policy evidence
        bytes32 contentHash;        // hash of ad content accepted by both agents
    }

    mapping(uint256 => Escrow) public escrows;
    uint256 public escrowCount;

    // Configurable dispute window - set to 60s for demo, 24h for production
    uint256 public disputeWindowSeconds = 24 hours;
    uint256 public protocolFeePercent = 2; // 2% fee on settled escrows

    // Protocol fee recipient
    address public feeRecipient;

    event EscrowFunded(
        uint256 indexed escrowId,
        address indexed sponsor,
        address indexed community,
        uint256 amount
    );
    event DeliveryLogged(uint256 indexed escrowId, string deliveryProof);
    event AgreementBound(uint256 indexed escrowId, bytes32 agreementHash, bytes32 contentHash);
    event EscrowSettled(uint256 indexed escrowId, uint256 communityAmount, uint256 fee);
    event EscrowDisputed(uint256 indexed escrowId, address disputer);
    event EscrowRefunded(uint256 indexed escrowId);

    constructor(address _usdc, address _feeRecipient) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
    }

    // Called by Sponsor Agent after negotiation concludes
    function fundEscrow(
        address communityAgent,
        uint256 amount,
        uint256 intentId,
        uint256 sponsorErc8004Id,
        uint256 communityErc8004Id
    ) external nonReentrant returns (uint256) {
        return _fundEscrow(
            communityAgent,
            amount,
            intentId,
            sponsorErc8004Id,
            communityErc8004Id,
            bytes32(0),
            bytes32(0)
        );
    }

    function fundEscrowWithAgreement(
        address communityAgent,
        uint256 amount,
        uint256 intentId,
        uint256 sponsorErc8004Id,
        uint256 communityErc8004Id,
        bytes32 agreementHash,
        bytes32 contentHash
    ) external nonReentrant returns (uint256) {
        require(agreementHash != bytes32(0), "Empty agreement hash");
        require(contentHash != bytes32(0), "Empty content hash");
        return _fundEscrow(
            communityAgent,
            amount,
            intentId,
            sponsorErc8004Id,
            communityErc8004Id,
            agreementHash,
            contentHash
        );
    }

    function _fundEscrow(
        address communityAgent,
        uint256 amount,
        uint256 intentId,
        uint256 sponsorErc8004Id,
        uint256 communityErc8004Id,
        bytes32 agreementHash,
        bytes32 contentHash
    ) internal returns (uint256) {
        require(amount > 0, "Amount must be positive");
        require(
            usdc.transferFrom(msg.sender, address(this), amount),
            "USDC transfer failed"
        );

        uint256 id = escrowCount++;
        escrows[id] = Escrow({
            sponsorAgent: msg.sender,
            communityAgent: communityAgent,
            amount: amount,
            intentId: intentId,
            deliveryProof: "",
            deliveredAt: 0,
            settleAfter: 0,
            status: EscrowStatus.FUNDED,
            sponsorErc8004Id: sponsorErc8004Id,
            communityErc8004Id: communityErc8004Id,
            agreementHash: agreementHash,
            contentHash: contentHash
        });

        emit EscrowFunded(id, msg.sender, communityAgent, amount);
        if (agreementHash != bytes32(0) || contentHash != bytes32(0)) {
            emit AgreementBound(id, agreementHash, contentHash);
        }
        return id;
    }

    // Called by Community Agent after posting ad
    function logDelivery(
        uint256 escrowId,
        string calldata deliveryProof
    ) external {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.communityAgent, "Not community agent");
        require(e.status == EscrowStatus.FUNDED, "Wrong status");
        require(bytes(deliveryProof).length > 0, "Empty proof");

        e.deliveryProof = deliveryProof;
        e.deliveredAt = block.timestamp;
        e.settleAfter = block.timestamp + disputeWindowSeconds;
        e.status = EscrowStatus.DELIVERED;

        emit DeliveryLogged(escrowId, deliveryProof);
    }

    // Anyone can call this after dispute window closes - auto-settles
    function settle(uint256 escrowId) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.DELIVERED, "Not delivered");
        require(block.timestamp >= e.settleAfter, "Dispute window open");

        e.status = EscrowStatus.SETTLED;

        uint256 fee = (e.amount * protocolFeePercent) / 100;
        uint256 communityAmount = e.amount - fee;

        require(usdc.transfer(e.communityAgent, communityAmount), "Payment failed");
        if (fee > 0) require(usdc.transfer(feeRecipient, fee), "Fee transfer failed");

        emit EscrowSettled(escrowId, communityAmount, fee);
    }

    // Sponsor Agent can dispute within the window
    function dispute(uint256 escrowId) external {
        Escrow storage e = escrows[escrowId];
        require(msg.sender == e.sponsorAgent, "Not sponsor agent");
        require(e.status == EscrowStatus.DELIVERED, "Not delivered");
        require(block.timestamp < e.settleAfter, "Window closed");

        e.status = EscrowStatus.DISPUTED;
        emit EscrowDisputed(escrowId, msg.sender);
    }

    // Owner resolves disputes manually
    function resolveDispute(uint256 escrowId, bool sponsorWins) external onlyOwner nonReentrant {
        Escrow storage e = escrows[escrowId];
        require(e.status == EscrowStatus.DISPUTED, "Not disputed");

        if (sponsorWins) {
            e.status = EscrowStatus.REFUNDED;
            require(usdc.transfer(e.sponsorAgent, e.amount), "Refund failed");
            emit EscrowRefunded(escrowId);
        } else {
            e.status = EscrowStatus.SETTLED;
            uint256 fee = (e.amount * protocolFeePercent) / 100;
            uint256 communityAmount = e.amount - fee;
            require(usdc.transfer(e.communityAgent, communityAmount), "Payment failed");
            if (fee > 0) require(usdc.transfer(feeRecipient, fee), "Fee transfer failed");
            emit EscrowSettled(escrowId, communityAmount, fee);
        }
    }

    // Admin: set dispute window
    function setDisputeWindow(uint256 seconds_) external onlyOwner {
        disputeWindowSeconds = seconds_;
    }

    // Admin: set protocol fee (0-100)
    function setProtocolFee(uint256 feePercent) external onlyOwner {
        require(feePercent <= 100, "Invalid fee");
        protocolFeePercent = feePercent;
    }

    // Admin: set fee recipient
    function setFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "Zero address");
        feeRecipient = recipient;
    }
}
