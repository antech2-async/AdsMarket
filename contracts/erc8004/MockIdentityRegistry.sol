// SPDX-License-Reputationer: MIT
pragma solidity ^0.8.24;

contract MockIdentityRegistry {
    string public constant name = "Mock ERC-8004 Agent Identity";
    string public constant symbol = "mAID";
    uint256 private _nextAgentId = 1;

    mapping(uint256 => string) private _agentURIs;
    mapping(uint256 => address) private _agentWallets;
    mapping(uint256 => address) private _owners;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        _agentURIs[agentId] = agentURI;
        _agentWallets[agentId] = msg.sender;
        _owners[agentId] = msg.sender;
        emit Transfer(address(0), msg.sender, agentId);
    }

    function tokenURI(uint256 agentId) public view returns (string memory) {
        require(_owners[agentId] != address(0), "Unknown agent");
        return _agentURIs[agentId];
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        require(_owners[agentId] != address(0), "Unknown agent");
        return _agentWallets[agentId];
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        require(_owners[agentId] != address(0), "Unknown agent");
        return _owners[agentId];
    }

    function totalSupply() external view returns (uint256) {
        return _nextAgentId - 1;
    }
}
