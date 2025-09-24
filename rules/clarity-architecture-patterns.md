# Clarity Architecture Patterns and Design Principles

## Overview
This document outlines proven architectural patterns and design principles for building robust, scalable, and maintainable Clarity smart contracts based on the latest Stacks blockchain documentation and community best practices.

## Fundamental Design Principles

### 1. Separation of Concerns

#### 1.1 Modular Contract Architecture
```clarity
;; Storage Contract - handles data persistence
(define-map user-data principal {
  balance: uint,
  last-activity: uint,
  metadata: (string-ascii 100)
})

(define-read-only (get-user-data (user principal))
  (map-get? user-data user)
)

(define-public (update-user-data (user principal) (data { balance: uint, last-activity: uint, metadata: (string-ascii 100) }))
  (begin
    (asserts! (is-eq contract-caller .business-logic) (err u100))
    (map-set user-data user data)
    (ok true)
  )
)
```

```clarity
;; Business Logic Contract - handles operations
(define-public (process-user-transaction (amount uint))
  (let ((current-data (unwrap! (contract-call? .storage get-user-data tx-sender) (err u101))))
    (let ((new-balance (+ (get balance current-data) amount)))
      (try! (contract-call? .storage update-user-data tx-sender {
        balance: new-balance,
        last-activity: stacks-block-height,
        metadata: (get metadata current-data)
      }))
      (ok new-balance)
    )
  )
)
```

#### 1.2 Access Control Layer
```clarity
;; Access Control Contract
(define-map roles principal (string-ascii 20))
(define-map permissions (string-ascii 20) (list 50 (string-ascii 30)))

(define-public (grant-role (user principal) (role (string-ascii 20)))
  (begin
    (asserts! (has-permission tx-sender "manage-roles") (err u100))
    (map-set roles user role)
    (ok true)
  )
)

(define-read-only (has-permission (user principal) (action (string-ascii 30)))
  (match (map-get? roles user)
    role (is-some (index-of (default-to (list) (map-get? permissions role)) action))
    false
  )
)

(define-read-only (check-authorization (user principal) (action (string-ascii 30)))
  (asserts! (has-permission user action) (err u403))
)
```

### 2. State Management Patterns

#### 2.1 State Machine Pattern
```clarity
;; Contract State Machine
(define-constant state-inactive u0)
(define-constant state-active u1)
(define-constant state-paused u2)
(define-constant state-upgrading u3)

(define-data-var contract-state uint state-inactive)

(define-map valid-transitions uint (list 5 uint))

;; Initialize valid state transitions
(map-set valid-transitions state-inactive (list state-active))
(map-set valid-transitions state-active (list state-paused state-upgrading))
(map-set valid-transitions state-paused (list state-active))
(map-set valid-transitions state-upgrading (list state-active))

(define-private (is-valid-transition (from uint) (to uint))
  (is-some (index-of (default-to (list) (map-get? valid-transitions from)) to))
)

(define-public (transition-state (new-state uint))
  (let ((current-state (var-get contract-state)))
    (asserts! (is-valid-transition current-state new-state) (err u100))
    (asserts! (is-eq contract-caller contract-owner) (err u101))
    (var-set contract-state new-state)
    (print { event: "state-transition", from: current-state, to: new-state })
    (ok true)
  )
)

(define-private (require-state (required-state uint))
  (asserts! (is-eq (var-get contract-state) required-state) (err u102))
)

(define-public (state-dependent-operation)
  (begin
    (try! (require-state state-active))
    ;; Operation logic here
    (ok true)
  )
)
```

#### 2.2 Event Sourcing Pattern
```clarity
;; Event Store Pattern
(define-map events uint {
  event-type: (string-ascii 20),
  actor: principal,
  timestamp: uint,
  data: (string-utf8 500)
})

(define-data-var event-counter uint u0)

(define-private (emit-event (event-type (string-ascii 20)) (data (string-utf8 500)))
  (let ((event-id (+ (var-get event-counter) u1)))
    (map-set events event-id {
      event-type: event-type,
      actor: tx-sender,
      timestamp: stacks-block-height,
      data: data
    })
    (var-set event-counter event-id)
    event-id
  )
)

(define-public (process-transfer (amount uint) (recipient principal))
  (begin
    ;; Business logic
    (try! (execute-transfer amount recipient))
    
    ;; Record event
    (emit-event "transfer" (concat (concat (principal-to-string tx-sender) " -> ") (principal-to-string recipient)))
    (ok true)
  )
)

(define-read-only (get-event-history (start-id uint) (end-id uint))
  (map get-event (generate-range start-id end-id))
)

(define-private (get-event (event-id uint))
  (map-get? events event-id)
)
```

### 3. Contract Composition Patterns

#### 3.1 Registry Pattern
```clarity
;; Contract Registry
(define-map registered-contracts (string-ascii 30) principal)
(define-map contract-metadata principal {
  name: (string-ascii 30),
  version: uint,
  description: (string-ascii 100),
  is-active: bool
})

(define-public (register-contract (name (string-ascii 30)) (contract-address principal) (metadata { name: (string-ascii 30), version: uint, description: (string-ascii 100), is-active: bool }))
  (begin
    (asserts! (is-eq contract-caller contract-owner) (err u100))
    (asserts! (is-none (map-get? registered-contracts name)) (err u101))
    
    (map-set registered-contracts name contract-address)
    (map-set contract-metadata contract-address metadata)
    (ok true)
  )
)

(define-read-only (get-contract (name (string-ascii 30)))
  (map-get? registered-contracts name)
)

(define-public (call-registered-contract (name (string-ascii 30)) (function-name (string-ascii 30)))
  (let ((contract-address (unwrap! (get-contract name) (err u404))))
    ;; Dynamic contract calling would require traits
    (ok contract-address)
  )
)
```

#### 3.2 Factory Pattern
```clarity
;; Token Factory Contract
(define-map created-tokens uint principal)
(define-data-var token-counter uint u0)

(define-public (create-token (name (string-ascii 32)) (symbol (string-ascii 10)) (initial-supply uint))
  (let ((token-id (+ (var-get token-counter) u1)))
    ;; In practice, this would deploy a new contract
    ;; For this example, we simulate with a registry entry
    (map-set created-tokens token-id tx-sender) ;; Placeholder for actual token contract
    (var-set token-counter token-id)
    
    (print {
      event: "token-created",
      id: token-id,
      creator: tx-sender,
      name: name,
      symbol: symbol,
      supply: initial-supply
    })
    
    (ok token-id)
  )
)

(define-read-only (get-created-tokens (creator principal))
  (filter (lambda (token-id) (is-eq (map-get? created-tokens token-id) (some creator)))
          (generate-token-list))
)

(define-private (generate-token-list)
  ;; Generate list of token IDs up to current counter
  (generate-sequence (var-get token-counter))
)
```

### 4. Upgrade Patterns

#### 4.1 Proxy-Implementation Pattern
```clarity
;; Proxy Contract
(define-data-var implementation principal .implementation-v1)
(define-data-var admin principal tx-sender)

(define-public (upgrade (new-implementation principal))
  (begin
    (asserts! (is-eq contract-caller (var-get admin)) (err u100))
    (var-set implementation new-implementation)
    (print { event: "upgraded", new-implementation: new-implementation })
    (ok true)
  )
)

(define-public (delegate-call (function-data (buff 1024)))
  ;; In practice, this would use delegatecall-like functionality
  ;; Clarity doesn't have direct delegatecall, so this is conceptual
  (contract-call? (var-get implementation) execute function-data)
)

;; Implementation Contract Template
(define-public (execute (function-data (buff 1024)))
  ;; Parse function data and execute
  (ok true)
)
```

#### 4.2 Versioned Storage Pattern
```clarity
;; Versioned Storage Contract
(define-data-var storage-version uint u1)
(define-map data-v1 principal uint)
(define-map data-v2 principal { balance: uint, metadata: (string-ascii 50) })

(define-read-only (get-data (user principal))
  (if (is-eq (var-get storage-version) u1)
    (match (map-get? data-v1 user)
      value (some { balance: value, metadata: "" })
      none
    )
    (map-get? data-v2 user)
  )
)

(define-public (migrate-to-v2)
  (begin
    (asserts! (is-eq contract-caller contract-owner) (err u100))
    (asserts! (is-eq (var-get storage-version) u1) (err u101))
    
    ;; Migration logic would go here
    (var-set storage-version u2)
    (ok true)
  )
)
```

### 5. Security Patterns

#### 5.1 Circuit Breaker Pattern
```clarity
;; Circuit Breaker Implementation
(define-data-var is-circuit-open bool false)
(define-data-var failure-count uint u0)
(define-data-var last-failure-time uint u0)

(define-constant max-failures u5)
(define-constant timeout-blocks u144) ;; ~24 hours

(define-private (should-trip-circuit)
  (and 
    (>= (var-get failure-count) max-failures)
    (<= (- stacks-block-height (var-get last-failure-time)) timeout-blocks)
  )
)

(define-private (record-failure)
  (begin
    (var-set failure-count (+ (var-get failure-count) u1))
    (var-set last-failure-time stacks-block-height)
    (if (should-trip-circuit)
      (var-set is-circuit-open true)
      true
    )
  )
)

(define-private (record-success)
  (begin
    (var-set failure-count u0)
    (var-set is-circuit-open false)
  )
)

(define-public (protected-operation (param uint))
  (begin
    (asserts! (not (var-get is-circuit-open)) (err u500))
    
    (match (risky-operation param)
      success (begin (record-success) (ok success))
      error (begin (record-failure) (err error))
    )
  )
)
```

#### 5.2 Rate Limiting Pattern
```clarity
;; Rate Limiting Implementation
(define-map user-rate-limits principal { 
  last-action: uint, 
  action-count: uint 
})

(define-constant max-actions-per-period u10)
(define-constant rate-limit-period u144) ;; blocks

(define-private (is-rate-limited (user principal))
  (match (map-get? user-rate-limits user)
    limits 
      (let ((time-since-last (- stacks-block-height (get last-action limits))))
        (if (> time-since-last rate-limit-period)
          false ;; Reset period
          (>= (get action-count limits) max-actions-per-period)
        )
      )
    false ;; No previous actions
  )
)

(define-private (update-rate-limit (user principal))
  (let ((current-limits (default-to { last-action: u0, action-count: u0 } (map-get? user-rate-limits user)))
        (time-since-last (- stacks-block-height (get last-action current-limits))))
    (if (> time-since-last rate-limit-period)
      ;; Reset counter
      (map-set user-rate-limits user { last-action: stacks-block-height, action-count: u1 })
      ;; Increment counter
      (map-set user-rate-limits user {
        last-action: stacks-block-height,
        action-count: (+ (get action-count current-limits) u1)
      })
    )
  )
)

(define-public (rate-limited-function (param uint))
  (begin
    (asserts! (not (is-rate-limited tx-sender)) (err u429))
    (update-rate-limit tx-sender)
    ;; Function logic
    (ok param)
  )
)
```

### 6. Data Access Patterns

#### 6.1 Repository Pattern
```clarity
;; User Repository
(define-trait user-repository-trait
  (
    (get-user (principal) (response (optional { name: (string-ascii 50), email: (string-ascii 100) }) uint))
    (save-user (principal { name: (string-ascii 50), email: (string-ascii 100) }) (response bool uint))
    (delete-user (principal) (response bool uint))
  )
)

;; Implementation
(define-map users principal { name: (string-ascii 50), email: (string-ascii 100) })

(define-public (get-user (user-id principal))
  (ok (map-get? users user-id))
)

(define-public (save-user (user-id principal) (user-data { name: (string-ascii 50), email: (string-ascii 100) }))
  (begin
    (map-set users user-id user-data)
    (ok true)
  )
)

(define-public (delete-user (user-id principal))
  (begin
    (map-delete users user-id)
    (ok true)
  )
)
```

#### 6.2 Query Builder Pattern
```clarity
;; Query Helper Functions
(define-read-only (get-users-by-filter (min-balance uint) (is-active bool))
  (filter (lambda (user-data) 
    (and 
      (>= (get balance user-data) min-balance)
      (is-eq (get is-active user-data) is-active)
    ))
    (get-all-users)
  )
)

(define-read-only (get-paginated-users (offset uint) (limit uint))
  (let ((all-users (get-all-users)))
    (slice? all-users offset (+ offset limit))
  )
)

(define-private (get-all-users)
  ;; This would need to be implemented based on your storage strategy
  ;; Could use a list of user IDs or other indexing mechanism
  (list)
)
```

### 7. Communication Patterns

#### 7.1 Observer Pattern
```clarity
;; Event Publisher
(define-map subscribers (string-ascii 30) (list 50 principal))

(define-public (subscribe (event-type (string-ascii 30)) (subscriber principal))
  (let ((current-subscribers (default-to (list) (map-get? subscribers event-type))))
    (map-set subscribers event-type (unwrap! (as-max-len? (append current-subscribers subscriber) u50) (err u100)))
    (ok true)
  )
)

(define-public (unsubscribe (event-type (string-ascii 30)) (subscriber principal))
  (let ((current-subscribers (default-to (list) (map-get? subscribers event-type))))
    (map-set subscribers event-type (filter (lambda (s) (not (is-eq s subscriber))) current-subscribers))
    (ok true)
  )
)

(define-private (notify-subscribers (event-type (string-ascii 30)) (event-data (string-utf8 200)))
  (let ((subscriber-list (default-to (list) (map-get? subscribers event-type))))
    (map (lambda (subscriber) 
      (contract-call? subscriber handle-event event-type event-data)
    ) subscriber-list)
  )
)

(define-public (publish-event (event-type (string-ascii 30)) (event-data (string-utf8 200)))
  (begin
    (notify-subscribers event-type event-data)
    (print { event: event-type, data: event-data })
    (ok true)
  )
)
```

#### 7.2 Message Queue Pattern
```clarity
;; Simple Message Queue
(define-map message-queue uint {
  sender: principal,
  recipient: principal,
  message: (string-utf8 500),
  timestamp: uint,
  processed: bool
})

(define-data-var message-counter uint u0)

(define-public (send-message (recipient principal) (message (string-utf8 500)))
  (let ((message-id (+ (var-get message-counter) u1)))
    (map-set message-queue message-id {
      sender: tx-sender,
      recipient: recipient,
      message: message,
      timestamp: stacks-block-height,
      processed: false
    })
    (var-set message-counter message-id)
    (ok message-id)
  )
)

(define-public (process-message (message-id uint))
  (let ((message-data (unwrap! (map-get? message-queue message-id) (err u404))))
    (asserts! (is-eq (get recipient message-data) tx-sender) (err u403))
    (asserts! (not (get processed message-data)) (err u409))
    
    (map-set message-queue message-id (merge message-data { processed: true }))
    (ok message-data)
  )
)
```

### 8. Performance Optimization Patterns

#### 8.1 Lazy Loading Pattern
```clarity
;; Lazy computation cache
(define-map computed-values principal (optional uint))

(define-read-only (get-expensive-computation (user principal))
  (match (map-get? computed-values user)
    cached-value cached-value
    (let ((computed (perform-expensive-computation user)))
      (map-set computed-values user (some computed))
      (some computed)
    )
  )
)

(define-private (perform-expensive-computation (user principal))
  ;; Expensive computation here
  u42
)

(define-public (invalidate-cache (user principal))
  (begin
    (map-set computed-values user none)
    (ok true)
  )
)
```

#### 8.2 Batch Processing Pattern
```clarity
;; Batch operations for gas efficiency
(define-public (batch-transfer (recipients (list 50 principal)) (amounts (list 50 uint)))
  (let ((transfers (zip recipients amounts)))
    (fold process-single-transfer transfers (ok (list)))
  )
)

(define-private (process-single-transfer (transfer { recipient: principal, amount: uint }) (acc (response (list 50 bool) uint)))
  (match acc
    success-list
      (match (execute-transfer (get amount transfer) (get recipient transfer))
        success (ok (unwrap! (as-max-len? (append success-list true) u50) (err u100)))
        error (err error)
      )
    error (err error)
  )
)

(define-private (zip (list-a (list 50 principal)) (list-b (list 50 uint)))
  ;; Combine two lists into list of tuples
  (map combine-elements (enumerate list-a list-b))
)
```

## Architectural Guidelines

### 1. Design for Composability
- Design contracts to work together seamlessly
- Use well-defined interfaces (traits)
- Minimize tight coupling between contracts
- Plan for future integrations

### 2. Optimize for Gas Efficiency
- Batch operations when possible
- Cache expensive computations
- Minimize storage operations
- Use efficient data structures

### 3. Plan for Upgradability
- Separate storage from logic
- Use proxy patterns where appropriate
- Version your data structures
- Plan migration strategies

### 4. Implement Proper Access Control
- Use role-based access control
- Implement the principle of least privilege
- Separate administrative functions
- Audit access patterns regularly

### 5. Design for Failure
- Implement circuit breakers
- Use graceful degradation
- Plan for emergency stops
- Handle external dependencies safely

Remember: Good architecture is not just about current requirements—it's about building systems that can evolve, scale, and remain secure over time.
