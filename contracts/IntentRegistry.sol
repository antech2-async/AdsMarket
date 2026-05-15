// SPDX-License-Reputationer: MIT
pragma solidity ^0.8.24;

contract IntentRegistry {
    struct SponsorIntent {
        address sponsorAgent;
        uint256 erc8004AgentId;
        uint256 maxBudgetUsdc;     // in USDC units (6 decimals)
        uint256 minMemberCount;
        string contentPolicy;      // IPFS URI to content rules JSON
        string adCopy;             // IPFS URI to ad content
        uint256 expiresAt;
        bool active;
    }

    mapping(uint256 => SponsorIntent) public intents;
    uint256 public intentCount;

    // Index by sponsor agent for quick lookup
    mapping(address => uint256[]) public intentsBySponsor;

    event IntentBroadcast(
        uint256 indexed intentId,
        address indexed sponsorAgent,
        uint256 maxBudgetUsdc,
        uint256 minMemberCount
    );
    event IntentCancelled(uint256 indexed intentId);
    event IntentFulfilled(uint256 indexed intentId, uint256 escrowId);

    function broadcastIntent(
        uint256 erc8004AgentId,
        uint256 maxBudgetUsdc,
        uint256 minMemberCount,
        string calldata contentPolicy,
        string calldata adCopy,
        uint256 ttlSeconds
    ) external returns (uint256) {
        uint256 id = intentCount++;
        intents[id] = SponsorIntent({
            sponsorAgent: msg.sender,
            erc8004AgentId: erc8004AgentId,
            maxBudgetUsdc: maxBudgetUsdc,
            minMemberCount: minMemberCount,
            contentPolicy: contentPolicy,
            adCopy: adCopy,
            expiresAt: block.timestamp + ttlSeconds,
            active: true
        });

        intentsBySponsor[msg.sender].push(id);
        emit IntentBroadcast(id, msg.sender, maxBudgetUsdc, minMemberCount);
        return id;
    }

    function cancelIntent(uint256 intentId) external {
        require(intents[intentId].sponsorAgent == msg.sender, "Not your intent");
        intents[intentId].active = false;
        emit IntentCancelled(intentId);
    }

    function markFulfilled(uint256 intentId, uint256 escrowId) external {
        require(intents[intentId].sponsorAgent == msg.sender, "Not your intent");
        intents[intentId].active = false;
        emit IntentFulfilled(intentId, escrowId);
    }

    // Returns active intents - called by Community Agents
    function getActiveIntents(
        uint256 offset,
        uint256 limit
    ) external view returns (SponsorIntent[] memory, uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = offset; i < intentCount && count < limit; i++) {
            if (intents[i].active && intents[i].expiresAt > block.timestamp) count++;
        }

        SponsorIntent[] memory result = new SponsorIntent[](count);
        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;

        for (uint256 i = offset; i < intentCount && idx < count; i++) {
            if (intents[i].active && intents[i].expiresAt > block.timestamp) {
                result[idx] = intents[i];
                ids[idx] = i;
                idx++;
            }
        }

        return (result, ids);
    }
}
