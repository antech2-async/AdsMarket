// SPDX-License-Reputationer: MIT
pragma solidity ^0.8.24;

contract MockReputationRegistry {
    struct Feedback {
        address reviewer;
        uint256 score;
        string tag;
        string feedbackURI;
        uint256 timestamp;
    }

    mapping(uint256 => Feedback[]) private _feedback;

    function postFeedback(
        uint256 agentId,
        uint256 score,
        string calldata tag,
        string calldata feedbackURI
    ) external {
        require(score <= 100, "Invalid score");
        _feedback[agentId].push(Feedback({
            reviewer: msg.sender,
            score: score,
            tag: tag,
            feedbackURI: feedbackURI,
            timestamp: block.timestamp
        }));
    }

    function getFeedbackCount(uint256 agentId) external view returns (uint256) {
        return _feedback[agentId].length;
    }

    function getFeedback(uint256 agentId, uint256 index)
        external
        view
        returns (address reviewer, uint256 score, string memory tag, string memory feedbackURI, uint256 timestamp)
    {
        Feedback storage entry = _feedback[agentId][index];
        return (entry.reviewer, entry.score, entry.tag, entry.feedbackURI, entry.timestamp);
    }
}
