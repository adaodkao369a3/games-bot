import { createOrUpdateUser, getCoinBalance, disconnect, connect } from './dist/database/client.js';

const NEW_USER_ID = '987654321098765432'; // Different test user ID

async function testWalletNewUser() {
  console.log('=== Testing Wallet New User Behavior ===\n');
  
  try {
    // Connect to database
    console.log('1. Connecting to database...');
    await connect();
    console.log('✓ Database connected\n');
    
    // Clean up test user if exists
    console.log('2. Cleaning up test user...');
    const client = await (await import('./dist/database/client.js')).getClient();
    try {
      await client.query('DELETE FROM users WHERE user_id = $1', [NEW_USER_ID]);
      console.log('✓ Test user cleaned up\n');
    } finally {
      client.release();
    }
    
    // Test 3: Verify user doesn't exist
    console.log('3. Verifying user does not exist...');
    let balance = await getCoinBalance(NEW_USER_ID);
    if (balance === null) {
      console.log('✓ User does not exist (expected)\n');
    } else {
      console.log('✗ User already exists:', balance);
      return;
    }
    
    // Test 4: Simulate wallet command (auto-create user)
    console.log('4. Simulating wallet command for new user...');
    const walletResult = await createOrUpdateUser(NEW_USER_ID);
    console.log('✓ User auto-created with wallet command');
    console.log('  Balance:', walletResult.balance);
    console.log('  Lifetime Earned:', walletResult.lifetime_earned);
    console.log('  Lifetime Spent:', walletResult.lifetime_spent);
    
    // Test 5: Verify user now exists
    console.log('\n5. Verifying user now exists in database...');
    balance = await getCoinBalance(NEW_USER_ID);
    if (balance && balance.balance === 0) {
      console.log('✓ User exists with 0 balance (correct)');
      console.log('  Balance:', balance.balance);
      console.log('  Lifetime Earned:', balance.lifetime_earned);
      console.log('  Lifetime Spent:', balance.lifetime_spent);
    } else {
      console.log('✗ Unexpected balance:', balance);
    }
    
    console.log('\n=== Wallet new user test completed ===');
    
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    await disconnect();
    console.log('\n✓ Database disconnected');
  }
}

testWalletNewUser();
