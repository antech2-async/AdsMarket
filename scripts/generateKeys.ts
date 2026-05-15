import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

function generateKeys() {
  const sponsorKey = generatePrivateKey();
  const communityKey = generatePrivateKey();
  
  const sponsorAccount = privateKeyToAccount(sponsorKey);
  const communityAccount = privateKeyToAccount(communityKey);
  
  console.log('SPONSOR_PRIVATE_KEY=' + sponsorKey);
  console.log('SPONSOR_WALLET_ADDRESS=' + sponsorAccount.address);
  console.log('\nCOMMUNITY_PRIVATE_KEY=' + communityKey);
  console.log('COMMUNITY_WALLET_ADDRESS=' + communityAccount.address);
}

generateKeys();
