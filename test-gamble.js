import { connect, disconnect, addCoins, getCoinBalance, getTransactionHistory } from './dist/database/client.js';

const GAMBLE_USER_ID = '555555555555555555'; // Test user for gamble

async function testGambleOperations() {
  console.log('=== Testing Gamble Command Operations ===\n');
  
  try {
    // Connect to database
    console.log('1. Connecting to database...');
    await connect();
    console.log('✓ Database connected\n');
    
    // Clean up test user if exists
    console.log('2. Cleaning up test user...');
    const client = await (await import('./dist/database/client.js')).getClient();
    try {
      await client.query('DELETE FROM users WHERE user_id = $1', [GAMBLE_USER_ID]);
      console.log('✓ Test user cleaned up\n');
    } finally {
      client.release();
    }
    
    // Test 3: Give user initial coins for gambling
    console.log('3. Giving user 1000 coins for gambling...');
    const initialResult = await addCoins(GAMBLE_USER_ID, 1000, 'test_setup', 'Initial gambling funds');
    if (initialResult === 1000) {
      console.log('✓ User initialized with 1000 coins\n');
    } else {
      console.log('✗ Failed to initialize user');
      return;
    }
    
    // Test 4: Simulate gamble wager (deduct coins)
    console.log('4. Simulating gamble wager of 100 coins...');
    const wager = 100;
    const deductionResult = await addCoins(GAMBLE_USER_ID, -wager, 'gamble', 'Gamble wager');
    if (deductionResult === 900) {
      console.log('✓ Wager deducted successfully');
      console.log('  Balance after deduction:', deductionResult);
    } else {
      console.log('✗ Wager deduction failed');
      return;
    }
    
    // Test 5: Simulate win (award 2x wager)
    console.log('\n5. Simulating gamble win (2x payout)...');
    const payout = wager * 2;
    const winResult = await addCoins(GAMBLE_USER_ID, payout, 'gamble', 'Gamble winnings');
    if (winResult === 1100) {
      console.log('✓ Winnings awarded successfully');
      console.log('  Balance after win:', winResult);
    } else {
      console.log('✗ Win payout failed');
      return;
    }
    
    // Test 6: Verify transaction history
    console.log('\n6. Verifying transaction history...');
    const transactions = await getTransactionHistory(GAMBLE_USER_ID, 10);
    if (transactions.length >= 3) {
      console.log('✓ Transaction history recorded correctly');
      console.log('  Total transactions:', transactions.length);
      console.log('  Latest 3 transactions:');
      transactions.slice(0, 3).forEach((tx, i) => {
        console.log(`    ${i + 1}. ${tx.transaction_type}: ${tx.amount} coins (balance: ${tx.balance_after}) - ${tx.source}`);
      });
    } else {
      console.log('✗ Insufficient transactions recorded');
    }
    
    // Test 7: Attempt to gamble more than balance
    console.log('\n7. Attempting to gamble more than balance...');
    const overdrawWager = 2000;
    const overdrawResult = await addCoins(GAMBLE_USER_ID, -overdrawWager, 'gamble', 'Overdraw attempt');
    if (overdrawResult === null) {
      console.log('✓ Correctly rejected overdraw attempt');
    } else {
      console.log('✗ Overdraw should have been rejected');
    }
    
    // Test 8: Verify balance unchanged after failed gamble
    console.log('\n8. Verifying balance unchanged after failed gamble...');
    const balance = await getCoinBalance(GAMBLE_USER_ID);
    if (balance && balance.balance === 1100) {
      console.log('✓ Balance correctly unchanged at 1100');
    } else {
      console.log('✗ Balance changed incorrectly:', balance);
    }
    
    // Test 9: Simulate loss (wager deducted, no payout)
    console.log('\n9. Simulating gamble loss...');
    const lossWager = 50;
    const lossDeduction = await addCoins(GAMBLE_USER_ID, -lossWager, 'gamble', 'Gamble wager (loss)');
    if (lossDeduction === 1050) {
      console.log('✓ Loss wager deducted successfully');
      console.log('  Balance after loss:', lossDeduction);
    } else {
      console.log('✗ Loss wager failed');
    }
    
    // Test 10: Concurrent gamble operations (race condition test)
    console.log('\n10. Testing concurrent gamble operations for race conditions...');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(addCoins(GAMBLE_USER_ID, -10, 'gamble', `Concurrent gamble ${i}`));
    }
    const results = await Promise.all(promises);
    const successfulResults = results.filter(r => r !== null);
    console.log('✓ Concurrent operations completed');
    console.log('  Successful operations:', successfulResults.length, '/ 5');
    
    // Verify final balance
    const finalBalance = await getCoinBalance(GAMBLE_USER_ID);
    console.log('  Final balance:', finalBalance?.balance);
    console.log('  Expected: 1050 - (5 * 10) = 1000');
    if (finalBalance && finalBalance.balance === 1000) {
      console.log('✓ Final balance correct - no race conditions');
    } else {
      console.log('✗ Final balance incorrect - possible race condition');
    }
    
    console.log('\n=== Gamble operations test completed ===');
    
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    await disconnect();
    console.log('\n✓ Database disconnected');
  }
}

testGambleOperations();
