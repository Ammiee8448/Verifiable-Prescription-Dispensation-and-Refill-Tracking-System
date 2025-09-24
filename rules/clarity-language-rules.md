# Clarity Language Rules and Syntax Guide

## Overview
This document provides comprehensive rules for Clarity language syntax, semantics, and proper usage patterns based on the latest Clarity documentation and language specifications.

## Language Fundamentals

### 1. Data Types and Declarations

#### 1.1 Primitive Types
```clarity
;; Integer types (128-bit)
(define-data-var signed-number int 42)
(define-data-var unsigned-number uint u42)

;; Boolean type
(define-data-var is-active bool true)

;; Principal type (addresses)
(define-data-var owner principal tx-sender)
(define-data-var contract-address principal 'SP1234...CONTRACT)

;; Buffer type (byte arrays)
(define-data-var hash-value (buff 32) 0x1234567890abcdef)
(define-data-var signature (buff 65) 0x...)

;; String types
(define-data-var ascii-string (string-ascii 50) "Hello World")
(define-data-var utf8-string (string-utf8 100) u"Unicode 🔥")
```

#### 1.2 Complex Types
```clarity
;; Optional types
(define-data-var maybe-value (optional uint) none)
(define-data-var some-value (optional uint) (some u42))

;; Response types
(define-data-var result (response uint uint) (ok u100))
(define-data-var error-result (response uint uint) (err u404))

;; Tuple types
(define-data-var user-info {
  name: (string-ascii 50),
  age: uint,
  is-verified: bool
} {
  name: "Alice",
  age: u25,
  is-verified: true
})

;; List types
(define-data-var numbers (list 10 uint) (list u1 u2 u3))
(define-data-var addresses (list 5 principal) (list tx-sender))
```

### 2. Function Definition Rules

#### 2.1 Public Functions
```clarity
;; Public functions must return (response A B)
(define-public (public-function (param uint))
  (begin
    ;; Validation
    (asserts! (> param u0) (err u100))
    ;; Logic
    (ok param)
  )
)

;; Public functions can be called externally
(define-public (transfer (amount uint) (recipient principal))
  (begin
    ;; Must handle all error cases
    (asserts! (> amount u0) (err u200))
    (asserts! (not (is-eq tx-sender recipient)) (err u201))
    ;; Return response type
    (ok amount)
  )
)
```

#### 2.2 Read-Only Functions
```clarity
;; Read-only functions cannot modify state
(define-read-only (get-balance (user principal))
  ;; Can return any type
  (default-to u0 (map-get? balances user))
)

(define-read-only (calculate-fee (amount uint))
  ;; Pure calculation
  (/ (* amount u250) u10000) ;; 2.5% fee
)

;; Can call other read-only functions
(define-read-only (get-balance-with-fee (user principal))
  (let ((balance (get-balance user)))
    {
      balance: balance,
      fee: (calculate-fee balance),
      net: (- balance (calculate-fee balance))
    }
  )
)
```

#### 2.3 Private Functions
```clarity
;; Private functions are internal only
(define-private (validate-amount (amount uint))
  (and (> amount u0) (< amount u1000000))
)

;; Can return any type
(define-private (internal-calculation (a uint) (b uint))
  (+ (* a u2) b)
)

;; Cannot be called externally
(define-private (update-internal-state (value uint))
  (begin
    (var-set internal-counter (+ (var-get internal-counter) value))
    value
  )
)
```

### 3. Constants and Variables

#### 3.1 Constants
```clarity
;; Constants are evaluated at contract launch
(define-constant contract-name "MyContract")
(define-constant max-supply u1000000)
(define-constant fee-rate u250) ;; 2.5% in basis points

;; Mathematical constants
(define-constant seconds-per-day u86400)
(define-constant blocks-per-hour u6) ;; Approximate

;; Error constants
(define-constant err-unauthorized (err u100))
(define-constant err-insufficient-funds (err u101))
```

#### 3.2 Data Variables
```clarity
;; Mutable state variables
(define-data-var total-supply uint u0)
(define-data-var contract-owner principal tx-sender)
(define-data-var is-paused bool false)

;; Complex data variables
(define-data-var contract-metadata {
  version: uint,
  last-updated: uint,
  description: (string-ascii 100)
} {
  version: u1,
  last-updated: u0,
  description: "Initial version"
})
```

### 4. Maps and Data Structures

#### 4.1 Map Definitions
```clarity
;; Simple key-value maps
(define-map balances principal uint)
(define-map user-nonces principal uint)

;; Complex key maps
(define-map allowances { owner: principal, spender: principal } uint)

;; Complex value maps
(define-map user-profiles principal {
  name: (string-ascii 50),
  created-at: uint,
  is-active: bool,
  balance: uint
})

;; Nested structures (use carefully for gas efficiency)
(define-map voting-records { proposal-id: uint, voter: principal } {
  vote: bool,
  weight: uint,
  timestamp: uint
})
```

#### 4.2 Map Operations
```clarity
;; Reading from maps
(define-read-only (get-user-balance (user principal))
  (default-to u0 (map-get? balances user))
)

;; Writing to maps
(define-private (set-user-balance (user principal) (amount uint))
  (map-set balances user amount)
)

;; Deleting from maps
(define-private (remove-user (user principal))
  (map-delete balances user)
)

;; Complex map operations
(define-public (approve (spender principal) (amount uint))
  (begin
    (map-set allowances { owner: tx-sender, spender: spender } amount)
    (ok true)
  )
)
```

### 5. Control Flow and Logic

#### 5.1 Conditional Expressions
```clarity
;; Basic if expression
(define-read-only (get-status (value uint))
  (if (> value u100)
    "high"
    "low"
  )
)

;; Complex conditionals
(define-read-only (categorize-amount (amount uint))
  (if (is-eq amount u0)
    "zero"
    (if (< amount u100)
      "small"
      (if (< amount u1000)
        "medium"
        "large"
      )
    )
  )
)

;; Using match for optionals
(define-read-only (safe-get-balance (user principal))
  (match (map-get? balances user)
    balance balance
    u0
  )
)

;; Using match for responses
(define-public (safe-operation (param uint))
  (match (risky-function param)
    success (ok success)
    error (begin
      (print { event: "operation-failed", error: error })
      (err error)
    )
  )
)
```

#### 5.2 Assertions and Error Handling
```clarity
;; Basic assertions
(define-public (validated-function (amount uint))
  (begin
    (asserts! (> amount u0) (err u100))
    (asserts! (< amount u1000000) (err u101))
    (ok amount)
  )
)

;; Using try! for propagating errors
(define-public (chained-operations (param uint))
  (begin
    (try! (operation-one param))
    (try! (operation-two param))
    (try! (operation-three param))
    (ok true)
  )
)

;; Using unwrap! with error handling
(define-public (unwrap-example (user principal))
  (let ((balance (unwrap! (map-get? balances user) (err u404))))
    (ok balance)
  )
)
```

### 6. Built-in Functions and Keywords

#### 6.1 Arithmetic Operations
```clarity
;; Basic arithmetic (overflow/underflow protected)
(define-read-only (arithmetic-examples (a uint) (b uint))
  {
    addition: (+ a b),
    subtraction: (- a b), ;; Will abort on underflow
    multiplication: (* a b), ;; Will abort on overflow
    division: (/ a b), ;; Will abort on division by zero
    modulo: (mod a b)
  }
)

;; Safe arithmetic with bounds checking
(define-read-only (safe-percentage (amount uint) (percentage uint))
  (begin
    (asserts! (<= percentage u10000) (err u100)) ;; Max 100%
    (/ (* amount percentage) u10000)
  )
)
```

#### 6.2 String and Buffer Operations
```clarity
;; String operations
(define-read-only (string-examples)
  {
    length: (len "Hello"),
    concatenation: (concat "Hello" " World"),
    ascii-to-utf8: (to-utf8 "ASCII"),
    substring: (slice? "Hello World" u0 u5)
  }
)

;; Buffer operations
(define-read-only (buffer-examples (data (buff 32)))
  {
    length: (len data),
    slice: (slice? data u0 u16),
    concatenation: (concat 0x1234 0x5678)
  }
)
```

#### 6.3 Block and Chain Information
```clarity
;; Accessing blockchain data
(define-read-only (chain-info)
  {
    current-height: stacks-block-height,
    chain-id: chain-id,
    sender: tx-sender,
    caller: contract-caller
  }
)

;; Block information functions
(define-read-only (get-block-data (height uint))
  {
    id-header-hash: (get-stacks-block-info? id-header-hash height),
    time: (get-stacks-block-info? time height),
    header-hash: (get-stacks-block-info? header-hash height)
  }
)
```

### 7. Token Operations

#### 7.1 Fungible Token Operations
```clarity
;; Define fungible token
(define-fungible-token my-token)

;; Token operations
(define-public (mint-tokens (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq contract-caller contract-owner) (err u100))
    (ft-mint? my-token amount recipient)
  )
)

(define-public (transfer-tokens (amount uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) (err u100))
    (ft-transfer? my-token amount sender recipient)
  )
)

(define-read-only (get-token-balance (user principal))
  (ft-get-balance my-token user)
)

(define-read-only (get-token-supply)
  (ft-get-supply my-token)
)
```

#### 7.2 Non-Fungible Token Operations
```clarity
;; Define NFT
(define-non-fungible-token my-nft uint)

;; NFT operations
(define-public (mint-nft (token-id uint) (recipient principal))
  (begin
    (asserts! (is-eq contract-caller contract-owner) (err u100))
    (nft-mint? my-nft token-id recipient)
  )
)

(define-public (transfer-nft (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) (err u100))
    (nft-transfer? my-nft token-id sender recipient)
  )
)

(define-read-only (get-nft-owner (token-id uint))
  (nft-get-owner? my-nft token-id)
)
```

### 8. Contract Interaction Patterns

#### 8.1 Static Contract Calls
```clarity
;; Call known contract functions
(define-public (call-external-contract)
  (begin
    ;; Static call to known contract
    (try! (contract-call? .known-contract public-function u100))
    (ok true)
  )
)

;; Reading from external contracts
(define-read-only (get-external-data)
  (contract-call? .data-contract get-value)
)
```

#### 8.2 Dynamic Contract Calls with Traits
```clarity
;; Define trait for dynamic calls
(define-trait token-trait
  (
    (transfer (uint principal principal) (response bool uint))
    (get-balance (principal) (response uint uint))
  )
)

;; Use trait for dynamic calls
(define-public (dynamic-transfer (token-contract <token-trait>) (amount uint) (recipient principal))
  (contract-call? token-contract transfer amount tx-sender recipient)
)
```

### 9. Advanced Language Features

#### 9.1 Let Bindings and Scope
```clarity
;; Local variable bindings
(define-public (complex-calculation (input uint))
  (let (
    ;; Local bindings
    (doubled (* input u2))
    (fee (/ doubled u100))
    (result (- doubled fee))
  )
    ;; Use bindings in computation
    (begin
      (asserts! (> result u0) (err u100))
      (ok result)
    )
  )
)

;; Nested let expressions
(define-read-only (nested-calculation (a uint) (b uint))
  (let ((sum (+ a b)))
    (let ((product (* sum u3)))
      (let ((final (/ product u2)))
        final
      )
    )
  )
)
```

#### 9.2 List Operations
```clarity
;; List manipulation functions
(define-read-only (list-examples)
  (let (
    (numbers (list u1 u2 u3 u4 u5))
    (doubled (map double-number numbers))
    (sum (fold + numbers u0))
    (filtered (filter is-even numbers))
  )
    {
      original: numbers,
      doubled: doubled,
      sum: sum,
      evens: filtered,
      length: (len numbers)
    }
  )
)

(define-private (double-number (n uint))
  (* n u2)
)

(define-private (is-even (n uint))
  (is-eq (mod n u2) u0)
)
```

### 10. Language Constraints and Limitations

#### 10.1 Recursion Limitations
```clarity
;; Clarity does not support recursion
;; BAD: This will not compile
;; (define-public (recursive-function (n uint))
;;   (if (is-eq n u0)
;;     (ok u1)
;;     (recursive-function (- n u1))
;;   )
;; )

;; GOOD: Use iteration instead
(define-read-only (iterative-sum (n uint))
  (let ((numbers (generate-sequence n)))
    (fold + numbers u0)
  )
)

(define-private (generate-sequence (n uint))
  ;; Generate sequence iteratively
  (if (is-eq n u0)
    (list)
    (append (generate-sequence (- n u1)) n)
  )
)
```

#### 10.2 Type Safety Rules
```clarity
;; Clarity is strictly typed
;; All type conversions must be explicit

;; Converting between integer types
(define-read-only (type-conversions (num uint))
  {
    as-int: (to-int num),
    as-ascii: (int-to-ascii (to-int num)),
    as-utf8: (int-to-utf8 (to-int num))
  }
)

;; Principal conversions
(define-read-only (principal-operations (addr principal))
  {
    is-standard: (is-standard addr),
    components: (principal-destruct? addr)
  }
)
```

## Best Practices Summary

1. **Type Safety**: Always use explicit types and handle all possible cases
2. **Error Handling**: Use meaningful error codes and handle all error conditions
3. **State Management**: Keep state changes atomic and predictable
4. **Gas Efficiency**: Minimize computational complexity and external calls
5. **Readability**: Use clear variable names and comprehensive comments
6. **Security**: Validate all inputs and use proper access controls
7. **Testing**: Design functions to be easily testable
8. **Upgradability**: Plan for contract evolution from the beginning

Remember: Clarity's design prioritizes safety and predictability over flexibility. Embrace these constraints to write more secure and reliable smart contracts.
