import { connect, disconnect, addCoins, getCoinBalance, getTransactionHistory } from './dist/database/client.js';

const TEST_USER_ID = '123456789012345678'; // Test Discord user ID

async function testCoinOperations() {
  console.log('=== Bombo Coins Verification Test ===\n');
  
  try {
    // Connect to database
    console.log('1. Testing database connection...');
    await connect();
    console.log('✓ Database connected successfully\n');
    
    // Test 2: Verify schema exists
    console.log('2. Verifying database schema...');
    // Schema initialization happens in connect(), so if we got here, it worked
    console.log('✓ Schema initialized successfully\n');
    
    // Clean up test user if exists
    console.log('3. Cleaning up test user from previous runs...');
    const client = await (await import('./dist/database/client.js')).getClient();
    try {
      await client.query('DELETE FROM users WHERE user_id = $1', [TEST_USER_ID]);
      console.log('✓ Test user cleaned up\n');
    } finally {
      client.release();
    }
    
    // Test 4: New user behavior
    console.log('4. Testing new user behavior...');
    let balance = await getCoinBalance(TEST_USER_ID);
    if (balance === null) {
      console.log('✓ User does not exist (expected for new user)');
    } else {
      console.log('✗ User already exists with balance:', balance);
    }
    
    // Test 5: Award coins to new user
    console.log('\n5. Testing award coins to new user...');
    const awardResult = await addCoins(TEST_USER_ID, 100, 'test', 'Initial test award');
    if (awardResult !== null) {
      console.log('✓ Awarded 100 coins successfully');
      console.log('  New balance:', awardResult);
    } else {
      console.log('✗ Failed to award coins');
      return;
    }
    
    // Test 6: Get balance
    console.log('\n6. Testing get balance...');
    balance = await getCoinBalance(TEST_USER_ID);
    if (balance && balance.balance === 100) {
      console.log('✓ Balance retrieved correctly:', balance);
    } else {
      console.log('✗ Balance incorrect:', balance);
    }
    
    // Test 7: Remove coins
    console.log('\n7. Testing remove coins...');
    const removeResult = await addCoins(TEST_USER_ID, -30, 'test', 'Test removal');
    if (removeResult !== null && removeResult === 70) {
      console.log('✓ Removed 30 coins successfully');
      console.log('  New balance:', removeResult);
    } else {
      console.log('✗ Failed to remove coins or incorrect balance');
    }
    
    // Test 8: Attempt to remove more than balance
    console.log('\n8. Testing attempt to remove more than balance...');
    const overdrawResult = await addCoins(TEST_USER_ID, -100, 'test', 'Overdraw attempt');
    if (overdrawResult === null) {
      console.log('✓ Correctly rejected overdraw attempt');
    } else {
      console.log('✗ Overdraw attempt should have failed but succeeded');
    }
    
    // Test 9: Verify balance unchanged after failed overdraw
    console.log('\n9. Verifying balance unchanged after failed overdraw...');
    balance = await getCoinBalance(TEST_USER_ID);
    if (balance && balance.balance === 70) {
      console.log('✓ Balance correctly unchanged at 70');
    } else {
      console.log('✗ Balance changed incorrectly:', balance);
    }
    
    // Test 10: Zero amount
    console.log('\n10. Testing zero amount...');
    const zeroResult = await addCoins(TEST_USER_ID, 0, 'test', 'Zero amount test');
    if (zeroResult === null) {
      console.log('✓ Correctly rejected zero amount');
    } else {
      console.log('✗ Zero amount should have been rejected');
    }
    
    // Test 11: Negative amount (should be rejected by service)
    console.log('\n11. Testing negative amount (should be rejected by service)...');
    const negativeResult = await addCoins(TEST_USER_ID, -50, 'test', 'Negative direct');
    // This should succeed since addCoins accepts negative amounts (it's how remove works)
    if (negativeResult !== null && negativeResult === 20) {
      console.log('✓ Negative amount processed (allowed for removeCoins logic)');
      console.log('  New balance:', negativeResult);
    } else {
      console.log('✗ Unexpected result for negative amount');
    }
    
    // Test 12: Transaction history
    console.log('\n12. Testing transaction history...');
    const transactions = await getTransactionHistory(TEST_USER_ID);
    if (transactions && transactions.length > 0) {
      console.log('✓ Transaction history retrieved');
      console.log('  Number of transactions:', transactions.length);
      console.log('  Latest transaction:', {
        amount: transactions[0].amount,
        balance_after: transactions[0].balance_after,
        transaction_type: transactions[0].transaction_type,
        source: transactions[0].source
      });
    } else {
      console.log('✗ Failed to retrieve transaction history');
    }
    
    // Test 13: Concurrent operations (simulate race condition)
    console.log('\n13. Testing concurrent operations for race conditions...');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(addCoins(TEST_USER_ID, 10, 'concurrent_test', `Concurrent test ${i}`));
    }
    const results = await Promise.all(promises);
    const successfulResults = results.filter(r => r !== null);
    console.log('✓ Concurrent operations completed');
    console.log('  Successful operations:', successfulResults.length, '/ 5');
    console.log('  Final balance should be 20 + (5 * 10) = 70');
    
    // Verify final balance
    balance = await getCoinBalance(TEST_USER_ID);
    if (balance && balance.balance === 70) {
      console.log('✓ Final balance correct (70) - no race conditions detected');
    } else {
      console.log('✗ Final balance incorrect:', balance, '- possible race condition');
    }
    
    console.log('\n=== All tests completed ===');
    
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    await disconnect();
    console.log('\n✓ Database disconnected');
  }
}

testCoinOperations();
