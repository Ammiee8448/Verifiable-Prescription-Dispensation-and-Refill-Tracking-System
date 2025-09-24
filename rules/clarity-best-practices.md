# Clarity Smart Contract Best Practices

## Overview
This document provides comprehensive best practices for developing high-quality, maintainable, and efficient Clarity smart contracts based on the latest Stacks blockchain documentation and community standards.

## Code Quality and Structure

### 1. Contract Organization and Documentation

#### 1.1 Contract Header and Metadata
```clarity
;; Title: Token Contract
;; Description: A compliant fungible token implementation
;; Version: 1.0.0
;; Author: Developer Name
;; License: MIT

;; Contract implements SIP-010 fungible token standard
(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
```

#### 1.2 Logical Code Organization
```clarity
;; ===== CONSTANTS =====
(define-constant contract-owner tx-sender)
(define-constant err-unauthorized (err u100))
(define-constant err-insufficient-funds (err u101))

;; ===== DATA STRUCTURES =====
(define-data-var total-supply uint u0)
(define-map token-balances principal uint)

;; ===== PRIVATE FUNCTIONS =====
(define-private (is-valid-amount (amount uint))
  (> amount u0)
)

;; ===== READ-ONLY FUNCTIONS =====
(define-read-only (get-balance (user principal))
  (default-to u0 (map-get? token-balances user))
)

;; ===== PUBLIC FUNCTIONS =====
(define-public (transfer (amount uint) (recipient principal))
  ;; Implementation
  (ok true)
)
```

### 2. Naming Conventions and Style

#### 2.1 Consistent Naming Patterns
```clarity
;; Use kebab-case for all identifiers
(define-constant max-supply u1000000)
(define-data-var token-name (string-ascii 32) "MyToken")
(define-map user-balances principal uint)

;; Use descriptive error names
(define-constant err-insufficient-balance (err u100))
(define-constant err-transfer-to-self (err u101))
(define-constant err-amount-too-large (err u102))

;; Use clear function names that describe their purpose
(define-read-only (get-token-balance (user principal))
  (default-to u0 (map-get? user-balances user))
)

(define-public (mint-tokens (amount uint) (recipient principal))
  ;; Implementation
  (ok amount)
)
```

#### 2.2 Comments and Documentation
```clarity
;; Public function to transfer tokens between users
;; @param amount: Number of tokens to transfer (in smallest unit)
;; @param recipient: Principal address to receive tokens
;; @returns: (response uint uint) - success with transferred amount or error code
(define-public (transfer (amount uint) (recipient principal))
  (let ((sender-balance (get-token-balance tx-sender)))
    ;; Validate transfer conditions
    (asserts! (>= sender-balance amount) err-insufficient-balance)
    (asserts! (not (is-eq tx-sender recipient)) err-transfer-to-self)
    
    ;; Update balances atomically
    (map-set user-balances tx-sender (- sender-balance amount))
    (map-set user-balances recipient (+ (get-token-balance recipient) amount))
    
    ;; Emit transfer event and return success
    (print { event: "transfer", sender: tx-sender, recipient: recipient, amount: amount })
    (ok amount)
  )
)
```

### 3. Error Handling Patterns

#### 3.1 Comprehensive Error Definitions
```clarity
;; Group related errors with meaningful ranges
;; Authorization errors (100-199)
(define-constant err-unauthorized (err u100))
(define-constant err-invalid-caller (err u101))
(define-constant err-access-denied (err u102))

;; Validation errors (200-299)
(define-constant err-invalid-amount (err u200))
(define-constant err-invalid-address (err u201))
(define-constant err-invalid-state (err u202))

;; Business logic errors (300-399)
(define-constant err-insufficient-funds (err u300))
(define-constant err-transfer-failed (err u301))
(define-constant err-operation-not-allowed (err u302))
```

#### 3.2 Robust Error Handling
```clarity
(define-public (robust-operation (param uint))
  (let (
    ;; Use unwrap! with specific error handling
    (validated-param (unwrap! (validate-parameter param) err-invalid-amount))
    ;; Use try! for operations that might fail
    (operation-result (try! (perform-operation validated-param)))
  )
    ;; Additional validation after operation
    (asserts! (is-valid-result operation-result) err-operation-not-allowed)
    (ok operation-result)
  )
)

(define-private (validate-parameter (param uint))
  (if (and (> param u0) (< param u1000000))
    (some param)
    none
  )
)
```

### 4. Data Structure Design

#### 4.1 Efficient Map Usage
```clarity
;; Use composite keys for related data
(define-map user-allowances { owner: principal, spender: principal } uint)

;; Use tuples for complex data structures
(define-map user-profiles principal {
  balance: uint,
  last-activity: uint,
  is-active: bool,
  metadata: (string-ascii 100)
})

;; Optimize for gas efficiency
(define-read-only (get-allowance (owner principal) (spender principal))
  (default-to u0 (map-get? user-allowances { owner: owner, spender: spender }))
)
```

#### 4.2 State Variable Management
```clarity
;; Use appropriate data types
(define-data-var contract-active bool true)
(define-data-var last-block-height uint u0)
(define-data-var admin-address principal tx-sender)

;; Implement state guards
(define-private (require-active-contract)
  (asserts! (var-get contract-active) (err u400))
)

(define-public (toggle-contract-status)
  (begin
    (asserts! (is-eq contract-caller (var-get admin-address)) err-unauthorized)
    (var-set contract-active (not (var-get contract-active)))
    (ok (var-get contract-active))
  )
)
```

### 5. Function Design Patterns

#### 5.1 Pure and Read-Only Functions
```clarity
;; Use read-only for functions that don't modify state
(define-read-only (calculate-fee (amount uint) (rate uint))
  (/ (* amount rate) u10000) ;; Calculate percentage fee
)

(define-read-only (get-contract-info)
  {
    name: "MyContract",
    version: "1.0.0",
    total-supply: (var-get total-supply),
    is-active: (var-get contract-active)
  }
)

;; Use private functions for reusable logic
(define-private (is-authorized-user (user principal))
  (or 
    (is-eq user (var-get admin-address))
    (default-to false (map-get? authorized-users user))
  )
)
```

#### 5.2 Modular Function Design
```clarity
;; Break complex operations into smaller functions
(define-public (complex-transfer (amount uint) (recipient principal) (memo (string-utf8 100)))
  (begin
    ;; Validation phase
    (try! (validate-transfer-inputs amount recipient memo))
    
    ;; Execution phase
    (try! (execute-transfer amount recipient))
    
    ;; Logging phase
    (try! (log-transfer-event amount recipient memo))
    
    (ok true)
  )
)

(define-private (validate-transfer-inputs (amount uint) (recipient principal) (memo (string-utf8 100)))
  (begin
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (not (is-eq tx-sender recipient)) err-transfer-to-self)
    (asserts! (<= (len memo) u100) err-invalid-memo)
    (ok true)
  )
)
```

### 6. Gas Optimization

#### 6.1 Minimize External Calls
```clarity
;; BAD: Multiple external calls
(define-public (inefficient-function)
  (let (
    (value-a (try! (contract-call? .storage-contract get-value-a)))
    (value-b (try! (contract-call? .storage-contract get-value-b)))
    (value-c (try! (contract-call? .storage-contract get-value-c)))
  )
    (ok (+ value-a (+ value-b value-c)))
  )
)

;; GOOD: Single external call
(define-public (efficient-function)
  (let (
    (values (try! (contract-call? .storage-contract get-all-values)))
  )
    (ok (+ (get a values) (+ (get b values) (get c values))))
  )
)
```

#### 6.2 Optimize Data Access Patterns
```clarity
;; Cache frequently accessed values
(define-public (optimized-calculation (user principal))
  (let (
    (user-balance (get-token-balance user))
    (current-rate (var-get fee-rate))
  )
    ;; Use cached values in calculations
    (ok {
      balance: user-balance,
      fee: (calculate-fee user-balance current-rate),
      net: (- user-balance (calculate-fee user-balance current-rate))
    })
  )
)
```

### 7. Event Logging and Transparency

#### 7.1 Comprehensive Event Logging
```clarity
;; Log all significant state changes
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    
    ;; Update state
    (map-set token-balances recipient (+ (get-token-balance recipient) amount))
    (var-set total-supply (+ (var-get total-supply) amount))
    
    ;; Log the event
    (print {
      event: "mint",
      recipient: recipient,
      amount: amount,
      new-balance: (get-token-balance recipient),
      new-total-supply: (var-get total-supply),
      block-height: stacks-block-height
    })
    
    (ok amount)
  )
)
```

#### 7.2 Structured Event Data
```clarity
;; Use consistent event structure
(define-private (emit-transfer-event (from principal) (to principal) (amount uint))
  (print {
    event: "transfer",
    from: from,
    to: to,
    amount: amount,
    timestamp: stacks-block-height
  })
)

(define-private (emit-approval-event (owner principal) (spender principal) (amount uint))
  (print {
    event: "approval",
    owner: owner,
    spender: spender,
    amount: amount,
    timestamp: stacks-block-height
  })
)
```

### 8. Standard Compliance

#### 8.1 SIP-010 Token Implementation
```clarity
;; Implement all required SIP-010 functions
(define-public (get-name)
  (ok "MyToken")
)

(define-public (get-symbol)
  (ok "MTK")
)

(define-public (get-decimals)
  (ok u6)
)

(define-public (get-balance (who principal))
  (ok (default-to u0 (map-get? token-balances who)))
)

(define-public (get-total-supply)
  (ok (var-get total-supply))
)

(define-public (get-token-uri)
  (ok (some "https://example.com/token-metadata.json"))
)
```

#### 8.2 SIP-009 NFT Implementation
```clarity
;; NFT trait implementation
(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-non-fungible-token my-nft uint)
(define-data-var last-token-id uint u0)

(define-public (get-last-token-id)
  (ok (var-get last-token-id))
)

(define-public (get-token-uri (token-id uint))
  (ok (some (concat "https://api.example.com/nft/" (uint-to-ascii token-id))))
)

(define-public (get-owner (token-id uint))
  (ok (nft-get-owner? my-nft token-id))
)
```

### 9. Upgrade Patterns

#### 9.1 Proxy Pattern Implementation
```clarity
;; Upgradeable contract using proxy pattern
(define-data-var implementation-contract principal .implementation-v1)

(define-public (upgrade-implementation (new-implementation principal))
  (begin
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    (var-set implementation-contract new-implementation)
    (print { event: "upgrade", new-implementation: new-implementation })
    (ok true)
  )
)

(define-public (delegate-call (function-name (string-ascii 50)) (args (list 10 uint)))
  (contract-call? (var-get implementation-contract) execute function-name args)
)
```

### 10. Testing Integration

#### 10.1 Test-Friendly Design
```clarity
;; Expose internal state for testing
(define-read-only (get-contract-state)
  {
    total-supply: (var-get total-supply),
    contract-active: (var-get contract-active),
    admin-address: (var-get admin-address)
  }
)

;; Test helpers for development
(define-public (test-helper-reset-state)
  (begin
    ;; Only allow in test environment
    (asserts! (is-eq chain-id u1) (err u999)) ;; testnet only
    (var-set total-supply u0)
    (var-set contract-active true)
    (ok true)
  )
)
```

## Development Workflow Best Practices

### 1. Version Control
- Use semantic versioning for contract versions
- Tag releases with contract deployment information
- Document breaking changes in upgrade notes

### 2. Code Review Checklist
- [ ] All functions have proper error handling
- [ ] Access controls are correctly implemented
- [ ] Gas usage is optimized
- [ ] Events are properly logged
- [ ] Code follows naming conventions
- [ ] Documentation is complete and accurate

### 3. Deployment Process
1. Deploy to testnet first
2. Perform comprehensive testing
3. Conduct security audit
4. Document deployment parameters
5. Deploy to mainnet with proper verification

### 4. Monitoring and Maintenance
- Monitor contract events and state changes
- Track gas usage patterns
- Maintain upgrade documentation
- Plan for long-term maintenance

Remember: Good code is not just functional—it's readable, maintainable, and efficient.
