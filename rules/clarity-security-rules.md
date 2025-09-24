# Clarity Smart Contract Security Rules

## Overview
This document provides comprehensive security rules for developing secure Clarity smart contracts on the Stacks blockchain. These rules are based on the latest Clarity documentation and smart contract security best practices.

## Critical Security Rules

### 1. Access Control and Authorization

#### 1.1 Always Use `contract-caller` for Authorization
```clarity
;; GOOD: Use contract-caller for authorization
(define-constant contract-owner tx-sender)
(define-constant err-unauthorized (err u100))

(define-public (admin-function)
  (begin
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    ;; function logic
    (ok true)
  )
)

;; AVOID: Never use tx-origin equivalent patterns
;; Clarity doesn't have tx-origin, but be careful with tx-sender vs contract-caller
```

#### 1.2 Implement Proper Role-Based Access Control
```clarity
(define-map authorized-users principal bool)
(define-map user-roles principal (string-ascii 20))

(define-private (is-authorized (user principal) (required-role (string-ascii 20)))
  (and 
    (default-to false (map-get? authorized-users user))
    (is-eq (map-get? user-roles user) (some required-role))
  )
)

(define-public (restricted-function)
  (begin
    (asserts! (is-authorized contract-caller "admin") err-unauthorized)
    ;; function logic
    (ok true)
  )
)
```

### 2. Integer Overflow/Underflow Protection

#### 2.1 Clarity Automatic Protection
```clarity
;; Clarity automatically prevents overflow/underflow
;; These operations will abort the transaction if they would overflow/underflow
(+ u1 u340282366920938463463374607431768211455) ;; Will abort
(- u0 u1) ;; Will abort

;; Always handle arithmetic operations safely
(define-public (safe-add (a uint) (b uint))
  ;; Clarity will automatically abort on overflow
  (ok (+ a b))
)
```

#### 2.2 Explicit Checks for Business Logic
```clarity
(define-public (transfer-with-limits (amount uint) (max-amount uint))
  (begin
    ;; Explicit business logic checks
    (asserts! (<= amount max-amount) (err u101))
    (asserts! (> amount u0) (err u102))
    ;; Safe arithmetic - Clarity handles overflow
    (ok amount)
  )
)
```

### 3. Reentrancy Protection

#### 3.1 Follow Checks-Effects-Interactions Pattern
```clarity
(define-map user-balances principal uint)
(define-map withdrawal-locks principal bool)

(define-public (withdraw (amount uint))
  (let ((current-balance (default-to u0 (map-get? user-balances tx-sender))))
    ;; CHECKS: Validate inputs and state
    (asserts! (>= current-balance amount) (err u100))
    (asserts! (not (default-to false (map-get? withdrawal-locks tx-sender))) (err u101))
    
    ;; EFFECTS: Update state before external calls
    (map-set withdrawal-locks tx-sender true)
    (map-set user-balances tx-sender (- current-balance amount))
    
    ;; INTERACTIONS: External calls last
    (let ((transfer-result (as-contract (stx-transfer? amount tx-sender tx-sender))))
      (map-delete withdrawal-locks tx-sender)
      transfer-result
    )
  )
)
```

#### 3.2 Use Mutex Patterns When Necessary
```clarity
(define-data-var contract-locked bool false)

(define-private (require-unlocked)
  (asserts! (not (var-get contract-locked)) (err u200))
)

(define-public (protected-function)
  (begin
    (try! (require-unlocked))
    (var-set contract-locked true)
    ;; Critical section
    (let ((result (critical-operation)))
      (var-set contract-locked false)
      result
    )
  )
)
```

### 4. Input Validation and Sanitization

#### 4.1 Always Validate Function Parameters
```clarity
(define-constant err-invalid-amount (err u100))
(define-constant err-invalid-address (err u101))
(define-constant err-invalid-string-length (err u102))

(define-public (transfer-tokens (recipient principal) (amount uint) (memo (string-utf8 100)))
  (begin
    ;; Validate all inputs
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (not (is-eq recipient tx-sender)) err-invalid-address)
    (asserts! (<= (len memo) u100) err-invalid-string-length)
    
    ;; Function logic
    (ok true)
  )
)
```

#### 4.2 Validate Contract Addresses
```clarity
(define-public (call-external-contract (contract-addr principal))
  (begin
    ;; Validate contract address format
    (asserts! (is-standard contract-addr) (err u100))
    ;; Add to whitelist verification if needed
    (asserts! (is-whitelisted-contract contract-addr) (err u101))
    
    ;; Safe external call
    (contract-call? contract-addr some-function)
  )
)
```

### 5. Error Handling and Recovery

#### 5.1 Use Proper Error Codes and Messages
```clarity
;; Define clear error constants
(define-constant err-insufficient-funds (err u100))
(define-constant err-unauthorized-access (err u101))
(define-constant err-invalid-state (err u102))
(define-constant err-external-call-failed (err u103))

(define-public (robust-function)
  (begin
    ;; Use try! for operations that might fail
    (try! (risky-operation))
    ;; Use unwrap! with proper error handling
    (let ((value (unwrap! (map-get? some-map some-key) err-invalid-state)))
      (ok value)
    )
  )
)
```

#### 5.2 Implement Graceful Degradation
```clarity
(define-data-var emergency-stop bool false)

(define-read-only (is-emergency-stopped)
  (var-get emergency-stop)
)

(define-public (emergency-function)
  (begin
    (asserts! (not (is-emergency-stopped)) (err u200))
    ;; Normal operation
    (ok true)
  )
)

(define-public (emergency-stop-contract)
  (begin
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    (var-set emergency-stop true)
    (ok true)
  )
)
```

### 6. External Contract Interactions

#### 6.1 Handle External Call Failures
```clarity
(define-public (safe-external-call (target-contract principal))
  (match (contract-call? target-contract external-function)
    success (ok success)
    error (begin
      ;; Log the error and handle gracefully
      (print { event: "external-call-failed", error: error })
      (err error)
    )
  )
)
```

#### 6.2 Validate External Contract Responses
```clarity
(define-public (validated-external-call (target-contract principal))
  (let ((result (try! (contract-call? target-contract get-value))))
    ;; Validate the response
    (asserts! (> result u0) (err u100))
    (asserts! (< result u1000000) (err u101))
    (ok result)
  )
)
```

### 7. State Management Security

#### 7.1 Protect Against State Corruption
```clarity
(define-data-var total-supply uint u0)
(define-map token-balances principal uint)

(define-private (update-balance-safely (user principal) (new-balance uint))
  (let ((old-balance (default-to u0 (map-get? token-balances user)))
        (current-supply (var-get total-supply)))
    ;; Update balance
    (map-set token-balances user new-balance)
    ;; Update total supply
    (var-set total-supply (+ (- current-supply old-balance) new-balance))
    ;; Verify invariant
    (asserts! (>= (var-get total-supply) new-balance) (err u100))
    (ok true)
  )
)
```

### 8. Post-Conditions and Assertions

#### 8.1 Use Post-Conditions for Critical Operations
```clarity
(define-public (critical-transfer (amount uint) (recipient principal))
  (let ((sender-balance-before (stx-get-balance tx-sender))
        (recipient-balance-before (stx-get-balance recipient)))
    ;; Perform transfer
    (try! (stx-transfer? amount tx-sender recipient))
    
    ;; Verify post-conditions
    (asserts! (is-eq (stx-get-balance tx-sender) (- sender-balance-before amount)) (err u100))
    (asserts! (is-eq (stx-get-balance recipient) (+ recipient-balance-before amount)) (err u101))
    
    (ok true)
  )
)
```

### 9. Time-Based Security

#### 9.1 Handle Block Height Safely
```clarity
(define-constant blocks-per-day u144) ;; Approximate blocks per day

(define-public (time-locked-function (unlock-height uint))
  (begin
    ;; Validate unlock height is in the future
    (asserts! (> unlock-height stacks-block-height) (err u100))
    ;; Ensure reasonable time frame
    (asserts! (< unlock-height (+ stacks-block-height (* blocks-per-day u365))) (err u101))
    
    (ok true)
  )
)
```

### 10. Contract Upgrade Security

#### 10.1 Implement Secure Upgrade Patterns
```clarity
(define-data-var contract-version uint u1)
(define-data-var upgrade-authorized bool false)

(define-public (authorize-upgrade)
  (begin
    (asserts! (is-eq contract-caller contract-owner) err-unauthorized)
    (var-set upgrade-authorized true)
    (ok true)
  )
)

(define-public (execute-upgrade)
  (begin
    (asserts! (var-get upgrade-authorized) (err u100))
    ;; Upgrade logic here
    (var-set contract-version (+ (var-get contract-version) u1))
    (var-set upgrade-authorized false)
    (ok true)
  )
)
```

## Security Checklist

Before deploying any Clarity contract, ensure:

- [ ] All user inputs are properly validated
- [ ] Access control is implemented correctly using `contract-caller`
- [ ] Integer operations cannot cause unexpected behavior
- [ ] External calls are handled safely with proper error handling
- [ ] State changes follow the checks-effects-interactions pattern
- [ ] Critical operations have proper post-conditions
- [ ] Emergency stop mechanisms are in place where appropriate
- [ ] Contract upgrade paths are secure and authorized
- [ ] All error conditions are properly handled
- [ ] Functions have explicit visibility and proper documentation

## Common Vulnerabilities to Avoid

1. **Improper Access Control**: Always use `contract-caller` for authorization, not just `tx-sender`
2. **State Corruption**: Ensure state updates maintain contract invariants
3. **Unsafe External Calls**: Always handle external call failures gracefully
4. **Missing Input Validation**: Validate all function parameters and state conditions
5. **Reentrancy**: Follow checks-effects-interactions pattern
6. **Integer Issues**: While Clarity prevents overflow/underflow, validate business logic bounds
7. **Time Manipulation**: Use block height carefully and validate time-based conditions
8. **Improper Error Handling**: Always provide meaningful error codes and handle edge cases

Remember: Security is not just about preventing attacks, but also about ensuring your contract behaves predictably under all conditions.
