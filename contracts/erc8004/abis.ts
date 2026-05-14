import { parseAbi } from 'viem';

export const IDENTITY_REGISTRY_ABI = parseAbi([
  'function register(string calldata agentURI) external returns (uint256 agentId)',
  'function tokenURI(uint256 agentId) external view returns (string)',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
  'function totalSupply() external view returns (uint256)',
  'function ownerOf(uint256 agentId) external view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]);

export const REPUTATION_REGISTRY_ABI = parseAbi([
  'function postFeedback(uint256 agentId, uint256 score, string calldata tag, string calldata feedbackURI) external',
  'function getFeedbackCount(uint256 agentId) external view returns (uint256)',
  'function getFeedback(uint256 agentId, uint256 index) external view returns (address reviewer, uint256 score, string tag, string feedbackURI, uint256 timestamp)',
]);
