# Clarity Testing and Deployment Guidelines

## Overview
This document provides comprehensive guidelines for testing, deployment, and maintenance of Clarity smart contracts based on the latest Stacks blockchain documentation and industry best practices.

## Testing Strategies

### 1. Unit Testing with Clarinet

#### 1.1 Basic Test Structure
```typescript
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
  name: "Ensure that user can increment counter",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user1 = accounts.get("wallet_1")!;
    
    // Initial state check
    let getCountResult = chain.callReadOnlyFn(
      "counter",
      "get-count",
      [types.principal(user1.address)],
      user1.address
    );
    getCountResult.result.expectUint(0);
    
    // Execute transaction
    let block = chain.mineBlock([
      Tx.contractCall("counter", "count-up", [], user1.address),
    ]);
    
    // Verify transaction success
    block.receipts[0].result.expectOk().expectBool(true);
    
    // Verify state change
    getCountResult = chain.callReadOnlyFn(
      "counter",
      "get-count",
      [types.principal(user1.address)],
      user1.address
    );
    getCountResult.result.expectUint(1);
  },
});
```

#### 1.2 Advanced Testing Patterns
```typescript
// Test helper functions
const CONTRACT_NAME = "my-contract";

function mintTokensHelper(
  chain: Chain,
  sender: Account,
  recipient: Account,
  amount: number
) {
  return chain.mineBlock([
    Tx.contractCall(
      CONTRACT_NAME,
      "mint",
      [types.uint(amount), types.principal(recipient.address)],
      sender.address
    ),
  ]);
}

function getBalanceHelper(
  chain: Chain,
  user: Account,
  caller: Account = user
): number {
  const result = chain.callReadOnlyFn(
    CONTRACT_NAME,
    "get-balance",
    [types.principal(user.address)],
    caller.address
  );
  return result.result.expectUint();
}

// Comprehensive test with setup and teardown
Clarinet.test({
  name: "Complex token transfer scenario",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const alice = accounts.get("wallet_1")!;
    const bob = accounts.get("wallet_2")!;
    const charlie = accounts.get("wallet_3")!;
    
    // Setup: Mint tokens to Alice
    const mintAmount = 1000;
    let block = mintTokensHelper(chain, deployer, alice, mintAmount);
    block.receipts[0].result.expectOk();
    
    // Verify initial balances
    assertEquals(getBalanceHelper(chain, alice), mintAmount);
    assertEquals(getBalanceHelper(chain, bob), 0);
    assertEquals(getBalanceHelper(chain, charlie), 0);
    
    // Test: Transfer from Alice to Bob
    const transferAmount = 300;
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "transfer",
        [
          types.uint(transferAmount),
          types.principal(alice.address),
          types.principal(bob.address),
        ],
        alice.address
      ),
    ]);
    
    // Verify transfer success
    block.receipts[0].result.expectOk().expectBool(true);
    
    // Verify final balances
    assertEquals(getBalanceHelper(chain, alice), mintAmount - transferAmount);
    assertEquals(getBalanceHelper(chain, bob), transferAmount);
    
    // Test: Transfer more than balance (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "transfer",
        [
          types.uint(transferAmount + 1),
          types.principal(bob.address),
          types.principal(charlie.address),
        ],
        bob.address
      ),
    ]);
    
    // Verify transfer failure
    block.receipts[0].result.expectErr().expectUint(101); // Insufficient funds error
  },
});
```

#### 1.3 Error Condition Testing
```typescript
// Test all error conditions
Clarinet.test({
  name: "Test error conditions comprehensively",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user = accounts.get("wallet_1")!;
    const unauthorized = accounts.get("wallet_2")!;
    
    // Test unauthorized access
    let block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "admin-function",
        [],
        unauthorized.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(100); // Unauthorized error
    
    // Test invalid parameters
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "transfer",
        [types.uint(0), types.principal(user.address), types.principal(deployer.address)],
        user.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(200); // Invalid amount error
    
    // Test state-dependent operations
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "withdraw",
        [types.uint(100)],
        user.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(300); // Insufficient balance error
  },
});
```

### 2. Integration Testing

#### 2.1 Multi-Contract Interaction Testing
```typescript
Clarinet.test({
  name: "Test multi-contract interactions",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user = accounts.get("wallet_1")!;
    
    // Deploy multiple contracts and test interactions
    // Test contract A calling contract B
    let block = chain.mineBlock([
      Tx.contractCall(
        "contract-a",
        "call-contract-b",
        [types.uint(100)],
        user.address
      ),
    ]);
    
    block.receipts[0].result.expectOk();
    
    // Verify state changes in both contracts
    const contractAState = chain.callReadOnlyFn(
      "contract-a",
      "get-state",
      [],
      user.address
    );
    
    const contractBState = chain.callReadOnlyFn(
      "contract-b",
      "get-state",
      [],
      user.address
    );
    
    // Assert expected states
    contractAState.result.expectOk();
    contractBState.result.expectOk();
  },
});
```

#### 2.2 Cross-Chain Integration Testing
```typescript
// Test Bitcoin integration
Clarinet.test({
  name: "Test Bitcoin transaction verification",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const user = accounts.get("wallet_1")!;
    
    // Mock Bitcoin transaction data
    const mockTxHeight = 100000;
    const mockTx = "0x1234567890abcdef"; // Mock transaction hex
    const mockHeader = "0xabcdef1234567890"; // Mock block header
    const mockProof = {
      "tx-index": types.uint(1),
      "hashes": types.list([]),
      "tree-depth": types.uint(1)
    };
    
    let block = chain.mineBlock([
      Tx.contractCall(
        "bitcoin-integration",
        "verify-transaction",
        [
          types.uint(mockTxHeight),
          types.buff(Buffer.from(mockTx, "hex")),
          types.buff(Buffer.from(mockHeader, "hex")),
          types.tuple(mockProof)
        ],
        user.address
      ),
    ]);
    
    // Verify transaction verification result
    block.receipts[0].result.expectOk().expectBool(true);
  },
});
```

### 3. Property-Based Testing

#### 3.1 Invariant Testing
```typescript
// Test contract invariants
Clarinet.test({
  name: "Test token supply invariant",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const users = Array.from(accounts.values()).slice(1, 6); // Get 5 users
    
    let totalMinted = 0;
    
    // Perform random minting operations
    for (let i = 0; i < 10; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const randomAmount = Math.floor(Math.random() * 1000) + 1;
      
      let block = chain.mineBlock([
        Tx.contractCall(
          CONTRACT_NAME,
          "mint",
          [types.uint(randomAmount), types.principal(randomUser.address)],
          deployer.address
        ),
      ]);
      
      if (block.receipts[0].result.expectOk()) {
        totalMinted += randomAmount;
      }
    }
    
    // Verify total supply invariant
    const totalSupply = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-total-supply",
      [],
      deployer.address
    );
    
    assertEquals(totalSupply.result.expectOk().expectUint(), totalMinted);
    
    // Verify sum of individual balances equals total supply
    let sumOfBalances = 0;
    for (const user of users) {
      const balance = getBalanceHelper(chain, user, deployer);
      sumOfBalances += balance;
    }
    
    assertEquals(sumOfBalances, totalMinted);
  },
});
```

#### 3.2 Fuzz Testing
```typescript
// Fuzz testing with random inputs
Clarinet.test({
  name: "Fuzz test transfer operations",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const users = Array.from(accounts.values()).slice(1, 6);
    
    // Setup: Mint tokens to all users
    for (const user of users) {
      let block = mintTokensHelper(chain, deployer, user, 10000);
      block.receipts[0].result.expectOk();
    }
    
    // Fuzz test with random transfers
    for (let i = 0; i < 50; i++) {
      const sender = users[Math.floor(Math.random() * users.length)];
      const recipient = users[Math.floor(Math.random() * users.length)];
      const amount = Math.floor(Math.random() * 1000);
      
      const senderBalanceBefore = getBalanceHelper(chain, sender);
      const recipientBalanceBefore = getBalanceHelper(chain, recipient);
      
      let block = chain.mineBlock([
        Tx.contractCall(
          CONTRACT_NAME,
          "transfer",
          [
            types.uint(amount),
            types.principal(sender.address),
            types.principal(recipient.address),
          ],
          sender.address
        ),
      ]);
      
      // Verify state consistency
      const senderBalanceAfter = getBalanceHelper(chain, sender);
      const recipientBalanceAfter = getBalanceHelper(chain, recipient);
      
      if (block.receipts[0].result.isOk) {
        // Transfer succeeded - verify balances
        if (sender.address !== recipient.address) {
          assertEquals(senderBalanceAfter, senderBalanceBefore - amount);
          assertEquals(recipientBalanceAfter, recipientBalanceBefore + amount);
        }
      } else {
        // Transfer failed - balances should be unchanged
        assertEquals(senderBalanceAfter, senderBalanceBefore);
        assertEquals(recipientBalanceAfter, recipientBalanceBefore);
      }
    }
  },
});
```

### 4. Performance and Gas Testing

#### 4.1 Gas Cost Analysis
```typescript
Clarinet.test({
  name: "Analyze gas costs for different operations",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user = accounts.get("wallet_1")!;
    
    // Test single operation gas cost
    let block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "simple-operation",
        [types.uint(100)],
        user.address
      ),
    ]);
    
    console.log(`Simple operation gas cost: ${block.receipts[0].events.length}`);
    
    // Test batch operation gas cost
    const batchSize = 10;
    const batchData = Array.from({ length: batchSize }, (_, i) => types.uint(i + 1));
    
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "batch-operation",
        [types.list(batchData)],
        user.address
      ),
    ]);
    
    console.log(`Batch operation (${batchSize} items) gas cost: ${block.receipts[0].events.length}`);
    
    // Compare gas efficiency
    const gasPerItem = block.receipts[0].events.length / batchSize;
    console.log(`Gas per item in batch: ${gasPerItem}`);
  },
});
```

### 5. Security Testing

#### 5.1 Reentrancy Testing
```typescript
Clarinet.test({
  name: "Test reentrancy protection",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const attacker = accounts.get("wallet_1")!;
    
    // Setup: Deploy malicious contract that attempts reentrancy
    // (This would require a separate malicious contract)
    
    // Attempt reentrancy attack
    let block = chain.mineBlock([
      Tx.contractCall(
        "malicious-contract",
        "attempt-reentrancy",
        [],
        attacker.address
      ),
    ]);
    
    // Verify attack failed
    block.receipts[0].result.expectErr(); // Should fail due to reentrancy protection
  },
});
```

#### 5.2 Access Control Testing
```typescript
Clarinet.test({
  name: "Test comprehensive access control",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const admin = accounts.get("wallet_1")!;
    const user = accounts.get("wallet_2")!;
    const attacker = accounts.get("wallet_3")!;
    
    // Test admin operations
    let block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "grant-admin",
        [types.principal(admin.address)],
        deployer.address
      ),
    ]);
    block.receipts[0].result.expectOk();
    
    // Test authorized admin action
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "admin-only-function",
        [],
        admin.address
      ),
    ]);
    block.receipts[0].result.expectOk();
    
    // Test unauthorized access attempts
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "admin-only-function",
        [],
        attacker.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(100); // Unauthorized
    
    // Test privilege escalation attempts
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "grant-admin",
        [types.principal(attacker.address)],
        user.address
      ),
    ]);
    block.receipts[0].result.expectErr().expectUint(100); // Unauthorized
  },
});
```

## Deployment Process

### 1. Pre-Deployment Checklist

#### 1.1 Code Quality Checklist
```bash
# Run all tests
clarinet test

# Check contract syntax
clarinet check

# Analyze gas costs
clarinet test --costs

# Generate documentation
clarinet docs

# Security audit checklist:
# - All functions have proper access controls
# - Input validation is comprehensive
# - Error handling is robust
# - State changes are atomic
# - External calls are secure
# - Upgrade mechanisms are protected
```

#### 1.2 Configuration Verification
```toml
# Clarinet.toml verification
[project]
name = "my-project"
version = "1.0.0"
description = "Production-ready smart contract"
authors = ["Your Name <your.email@example.com>"]

[contracts.main-contract]
path = "contracts/main-contract.clar"
clarity_version = 3

[repl.analysis]
passes = ["check_checker"]

[repl.analysis.check_checker]
strict = true
trusted_sender = false
trusted_caller = false
callee_filter = false
```

### 2. Deployment Strategies

#### 2.1 Testnet Deployment
```bash
# Deploy to testnet first
clarinet deploy --testnet

# Verify deployment
stx balance <contract-address> --testnet

# Test contract interactions
stx contract-call <contract-address> <contract-name> <function-name> --testnet
```

#### 2.2 Mainnet Deployment
```bash
# Final verification before mainnet
clarinet check
clarinet test --coverage

# Deploy to mainnet (with proper key management)
clarinet deploy --mainnet --fee 50000

# Verify deployment
stx balance <contract-address> --mainnet

# Document deployment details
echo "Contract deployed at: <contract-address>" >> deployment.log
echo "Block height: $(stx block-height --mainnet)" >> deployment.log
echo "Transaction ID: <tx-id>" >> deployment.log
```

### 3. Post-Deployment Verification

#### 3.1 Contract State Verification
```typescript
// Post-deployment verification script
const verifyDeployment = async (contractAddress: string) => {
  // Verify contract is deployed
  const contractInfo = await fetch(`https://api.mainnet.hiro.so/v2/contracts/call-read/${contractAddress}/contract-name/get-contract-info`)
    .then(res => res.json());
  
  console.log("Contract info:", contractInfo);
  
  // Verify initial state
  const initialState = await fetch(`https://api.mainnet.hiro.so/v2/contracts/call-read/${contractAddress}/contract-name/get-initial-state`)
    .then(res => res.json());
  
  console.log("Initial state:", initialState);
  
  // Verify permissions
  const permissions = await fetch(`https://api.mainnet.hiro.so/v2/contracts/call-read/${contractAddress}/contract-name/get-permissions`)
    .then(res => res.json());
  
  console.log("Permissions:", permissions);
};
```

### 4. Monitoring and Maintenance

#### 4.1 Contract Monitoring
```typescript
// Monitoring script for contract events
const monitorContract = (contractAddress: string) => {
  // Monitor contract calls
  const ws = new WebSocket('wss://api.mainnet.hiro.so/v2/stream/transactions');
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.contract_call?.contract_id === contractAddress) {
      console.log('Contract interaction detected:', {
        function: data.contract_call.function_name,
        sender: data.sender_address,
        timestamp: new Date().toISOString()
      });
      
      // Log to monitoring system
      logContractInteraction(data);
    }
  };
  
  // Monitor for errors
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    // Implement reconnection logic
  };
};

const logContractInteraction = (data: any) => {
  // Implement logging to your monitoring system
  // Could be database, analytics service, etc.
};
```

#### 4.2 Health Checks
```typescript
// Regular health check for contract
const performHealthCheck = async (contractAddress: string) => {
  try {
    // Check if contract is responsive
    const response = await fetch(`https://api.mainnet.hiro.so/v2/contracts/call-read/${contractAddress}/contract-name/health-check`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Verify expected state
    if (result.result === '"healthy"') {
      console.log('Contract health check passed');
      return true;
    } else {
      console.error('Contract health check failed:', result);
      return false;
    }
  } catch (error) {
    console.error('Health check error:', error);
    return false;
  }
};

// Run health checks periodically
setInterval(() => {
  performHealthCheck('CONTRACT_ADDRESS');
}, 60000); // Every minute
```

### 5. Upgrade Management

#### 5.1 Upgrade Planning
```typescript
// Upgrade preparation checklist
const prepareUpgrade = {
  // 1. Version compatibility check
  checkVersionCompatibility: () => {
    // Verify storage layout compatibility
    // Check API compatibility
    // Test migration scripts
  },
  
  // 2. Data migration planning
  planDataMigration: () => {
    // Identify data that needs migration
    // Write migration contracts
    // Test migration on testnet
  },
  
  // 3. Rollback strategy
  prepareRollback: () => {
    // Prepare rollback procedures
    // Test rollback scenarios
    // Document rollback steps
  }
};
```

#### 5.2 Upgrade Execution
```bash
#!/bin/bash
# Upgrade execution script

# 1. Deploy new version to testnet
clarinet deploy --testnet contracts/contract-v2.clar

# 2. Test new version thoroughly
clarinet test tests/upgrade-tests.ts

# 3. Deploy to mainnet
clarinet deploy --mainnet contracts/contract-v2.clar

# 4. Execute upgrade transaction
stx contract-call $CONTRACT_ADDRESS upgrade-to-v2 --mainnet

# 5. Verify upgrade success
stx contract-call $CONTRACT_ADDRESS get-version --mainnet

# 6. Monitor for issues
echo "Upgrade completed. Monitoring for issues..."
```

## Testing Best Practices

1. **Comprehensive Coverage**: Test all functions, error conditions, and edge cases
2. **State Verification**: Always verify state changes after operations
3. **Gas Optimization**: Monitor and optimize gas usage
4. **Security Focus**: Test for common vulnerabilities and attack vectors
5. **Integration Testing**: Test multi-contract interactions
6. **Performance Testing**: Verify contract performance under load
7. **Regression Testing**: Maintain tests for all previous functionality

## Deployment Best Practices

1. **Staged Deployment**: Always deploy to testnet first
2. **Verification**: Verify contract state and functionality post-deployment
3. **Documentation**: Document all deployment details and configurations
4. **Monitoring**: Implement comprehensive monitoring from day one
5. **Backup Plans**: Always have rollback and recovery procedures
6. **Security Audits**: Conduct security audits before mainnet deployment

Remember: Thorough testing and careful deployment are crucial for maintaining user trust and contract security in production environments.
